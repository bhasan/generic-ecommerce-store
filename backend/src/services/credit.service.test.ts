import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '../../generated/prisma';

const D = (n: number | string) => new Prisma.Decimal(n);

const prismaMock = {
  user: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  creditTransaction: {
    create: vi.fn(),
    findMany: vi.fn(),
    aggregate: vi.fn(),
  },
  // Interactive transaction: the service passes a callback that receives a tx client.
  $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(prismaMock)),
};

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

vi.mock('../config/database', () => ({ default: prismaMock }));
vi.mock('../utils/logger', () => ({ logger }));

async function makeService() {
  const { CreditService } = await import('./credit.service');
  return new CreditService();
}

// Inspect the data passed to the most recent creditTransaction.create call.
const lastCreate = () => prismaMock.creditTransaction.create.mock.calls.at(-1)![0].data;
const lastUpdate = () => prismaMock.user.update.mock.calls.at(-1)![0];

describe('CreditService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(prismaMock));
    prismaMock.creditTransaction.create.mockResolvedValue({ id: 1 });
    prismaMock.user.update.mockResolvedValue({ id: 7 });
  });

  describe('getUserCreditBalance', () => {
    it('returns the stored balance as a number', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ creditBalance: D(42.5) });
      const service = await makeService();

      await expect(service.getUserCreditBalance(7)).resolves.toBe(42.5);
      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { id: 7 },
        select: { creditBalance: true },
      });
    });

    it('throws 404 when the user does not exist', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      const service = await makeService();

      await expect(service.getUserCreditBalance(7)).rejects.toMatchObject({
        message: 'User not found',
        statusCode: 404,
      });
    });
  });

  describe('addCredit', () => {
    it('rejects a non-positive amount before touching the DB', async () => {
      const service = await makeService();

      await expect(service.addCredit(7, 0, 'bonus', 1)).rejects.toMatchObject({
        message: 'Amount must be greater than zero',
        statusCode: 400,
      });
      await expect(service.addCredit(7, -5, 'bonus', 1)).rejects.toMatchObject({ statusCode: 400 });
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('records an ADDED entry with balanceAfter and sets the new balance', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ creditBalance: D(10) });
      const service = await makeService();

      await service.addCredit(7, 25, 'bonus', 1);

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      const data = lastCreate();
      expect(data.type).toBe('ADDED');
      expect(data.note).toBe('bonus');
      expect(data.createdBy).toBe(1);
      expect(data.amount.toNumber()).toBe(25);
      expect(data.balanceAfter.toNumber()).toBe(35); // 10 + 25
      expect(lastUpdate().data.creditBalance.toNumber()).toBe(35);
    });
  });

  describe('removeCredit', () => {
    it('rejects a non-positive amount', async () => {
      const service = await makeService();
      await expect(service.removeCredit(7, 0, undefined, 1)).rejects.toMatchObject({ statusCode: 400 });
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('throws 404 when the user does not exist', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      const service = await makeService();
      await expect(service.removeCredit(7, 10, undefined, 1)).rejects.toMatchObject({
        message: 'User not found',
        statusCode: 404,
      });
    });

    it('refuses to overdraw the balance', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ creditBalance: D(5) });
      const service = await makeService();

      await expect(service.removeCredit(7, 10, undefined, 1)).rejects.toMatchObject({
        statusCode: 400,
      });
      expect(prismaMock.user.update).not.toHaveBeenCalled();
    });

    it('records a negative REMOVED entry and sets the decremented balance', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ creditBalance: D(50) });
      const service = await makeService();

      await service.removeCredit(7, 20, 'correction', 1);

      const data = lastCreate();
      expect(data.type).toBe('REMOVED');
      expect(data.note).toBe('correction');
      expect(data.amount.toNumber()).toBe(-20);
      expect(data.balanceAfter.toNumber()).toBe(30); // 50 - 20
      expect(lastUpdate().data.creditBalance.toNumber()).toBe(30);
    });

    it('allows removing the exact remaining balance (boundary)', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ creditBalance: D(15) });
      const service = await makeService();

      await service.removeCredit(7, 15, undefined, 1);
      expect(lastCreate().balanceAfter.toNumber()).toBe(0);
    });
  });

  describe('useCredit', () => {
    function makeTx() {
      return {
        user: { findUnique: vi.fn(), update: vi.fn() },
        creditTransaction: { create: vi.fn().mockResolvedValue({ id: 9 }) },
      };
    }

    it('throws 404 when the user does not exist', async () => {
      const tx = makeTx();
      tx.user.findUnique.mockResolvedValue(null);
      const service = await makeService();

      await expect(service.useCredit(7, 10, 55, tx as never)).rejects.toMatchObject({
        message: 'User not found',
        statusCode: 404,
      });
      expect(tx.user.update).not.toHaveBeenCalled();
    });

    it('rejects when the balance is insufficient', async () => {
      const tx = makeTx();
      tx.user.findUnique.mockResolvedValue({ creditBalance: D(3) });
      const service = await makeService();

      await expect(service.useCredit(7, 10, 55, tx as never)).rejects.toMatchObject({
        message: 'Insufficient credit balance',
        statusCode: 400,
      });
      expect(tx.user.update).not.toHaveBeenCalled();
      expect(tx.creditTransaction.create).not.toHaveBeenCalled();
    });

    it('decrements the balance and records a negative USED entry tied to the order', async () => {
      const tx = makeTx();
      tx.user.findUnique.mockResolvedValue({ creditBalance: D(100) });
      const service = await makeService();

      await service.useCredit(7, 40, 55, tx as never);

      expect(tx.user.update.mock.calls[0][0].data.creditBalance.toNumber()).toBe(60);
      const data = tx.creditTransaction.create.mock.calls[0][0].data;
      expect(data.type).toBe('USED');
      expect(data.orderId).toBe(55);
      expect(data.amount.toNumber()).toBe(-40);
      expect(data.balanceAfter.toNumber()).toBe(60);
    });
  });

  describe('refundCredit', () => {
    it('records a positive REFUNDED entry tied to the order and increments the balance', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ creditBalance: D(40) });
      const service = await makeService();

      await service.refundCredit(7, 40, 55, 'order cancelled');

      const data = lastCreate();
      expect(data.type).toBe('REFUNDED');
      expect(data.orderId).toBe(55);
      expect(data.note).toBe('order cancelled');
      expect(data.amount.toNumber()).toBe(40);
      expect(data.balanceAfter.toNumber()).toBe(80); // 40 + 40
    });
  });

  describe('getCreditTransactions', () => {
    it('annotates each transaction with the staff username and returns numeric money', async () => {
      prismaMock.creditTransaction.findMany.mockResolvedValue([
        { id: 1, userId: 7, amount: D(25), balanceAfter: D(25), type: 'ADDED', createdBy: 2 },
        { id: 2, userId: 7, amount: D(-10), balanceAfter: D(15), type: 'USED', createdBy: null },
      ]);
      prismaMock.user.findMany.mockResolvedValue([{ id: 2, username: 'manager' }]);
      const service = await makeService();

      const result = await service.getCreditTransactions(7);

      expect(result[0].createdByUsername).toBe('manager');
      expect(result[0].amount).toBe(25);
      expect(result[0].balanceAfter).toBe(25);
      expect(result[1].createdByUsername).toBeNull();
      expect(prismaMock.user.findMany).toHaveBeenCalledWith({
        where: { id: { in: [2] } },
        select: { id: true, username: true },
      });
    });

    it('skips the staff lookup when no transaction has a creator', async () => {
      prismaMock.creditTransaction.findMany.mockResolvedValue([
        { id: 2, userId: 7, amount: D(-10), balanceAfter: D(0), type: 'USED', createdBy: null },
      ]);
      const service = await makeService();

      const result = await service.getCreditTransactions(7);

      expect(result[0].createdByUsername).toBeNull();
      expect(prismaMock.user.findMany).not.toHaveBeenCalled();
    });
  });

  describe('reconcileBalance', () => {
    it('reports reconciled when the cached balance equals the ledger sum', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ creditBalance: D(30) });
      prismaMock.creditTransaction.aggregate.mockResolvedValue({ _sum: { amount: D(30) } });
      const service = await makeService();

      await expect(service.reconcileBalance(7)).resolves.toEqual({
        cachedBalance: 30,
        ledgerSum: 30,
        reconciled: true,
      });
    });

    it('flags a mismatch (e.g. a legacy balance with no ledger history)', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ creditBalance: D(445.89) });
      prismaMock.creditTransaction.aggregate.mockResolvedValue({ _sum: { amount: null } });
      const service = await makeService();

      const result = await service.reconcileBalance(7);
      expect(result.reconciled).toBe(false);
      expect(result.ledgerSum).toBe(0);
      expect(result.cachedBalance).toBe(445.89);
    });
  });
});

