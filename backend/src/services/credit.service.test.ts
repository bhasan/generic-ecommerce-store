import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = {
  user: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  creditTransaction: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
  // The service hands an array of Prisma ops to $transaction and destructures
  // the first result; resolving every op mirrors Prisma's interactive batch.
  $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
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

describe('CreditService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (ops: Promise<unknown>[]) => Promise.all(ops));
  });

  describe('getUserCreditBalance', () => {
    it('returns the stored balance', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ creditBalance: 42.5 });
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

    it('records an ADDED transaction and increments the balance atomically', async () => {
      const txn = { id: 100, userId: 7, amount: 25, type: 'ADDED' };
      prismaMock.creditTransaction.create.mockResolvedValue(txn);
      prismaMock.user.update.mockResolvedValue({ id: 7, creditBalance: 25 });
      const service = await makeService();

      const result = await service.addCredit(7, 25, 'bonus', 1);

      expect(result).toEqual(txn);
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(prismaMock.creditTransaction.create).toHaveBeenCalledWith({
        data: { userId: 7, amount: 25, type: 'ADDED', note: 'bonus', createdBy: 1 },
      });
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { creditBalance: { increment: 25 } },
      });
    });
  });

  describe('removeCredit', () => {
    it('rejects a non-positive amount', async () => {
      const service = await makeService();
      await expect(service.removeCredit(7, 0, undefined, 1)).rejects.toMatchObject({ statusCode: 400 });
      expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
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
      prismaMock.user.findUnique.mockResolvedValue({ creditBalance: 5 });
      const service = await makeService();

      await expect(service.removeCredit(7, 10, undefined, 1)).rejects.toMatchObject({
        message: 'Cannot remove $10.00 — current balance is $5.00',
        statusCode: 400,
      });
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('records a negative REMOVED transaction and decrements the balance', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ creditBalance: 50 });
      const txn = { id: 101, userId: 7, amount: -20, type: 'REMOVED' };
      prismaMock.creditTransaction.create.mockResolvedValue(txn);
      prismaMock.user.update.mockResolvedValue({ id: 7, creditBalance: 30 });
      const service = await makeService();

      const result = await service.removeCredit(7, 20, 'correction', 1);

      expect(result).toEqual(txn);
      expect(prismaMock.creditTransaction.create).toHaveBeenCalledWith({
        data: { userId: 7, amount: -20, type: 'REMOVED', note: 'correction', createdBy: 1 },
      });
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { creditBalance: { decrement: 20 } },
      });
    });

    it('allows removing the exact remaining balance (boundary)', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ creditBalance: 15 });
      prismaMock.creditTransaction.create.mockResolvedValue({ id: 102, amount: -15, type: 'REMOVED' });
      prismaMock.user.update.mockResolvedValue({ id: 7, creditBalance: 0 });
      const service = await makeService();

      await expect(service.removeCredit(7, 15, undefined, 1)).resolves.toBeTruthy();
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('useCredit', () => {
    // useCredit runs inside an outer transaction, so it receives a tx client.
    function makeTx() {
      return {
        user: { findUnique: vi.fn(), update: vi.fn() },
        creditTransaction: { create: vi.fn() },
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
      tx.user.findUnique.mockResolvedValue({ creditBalance: 3 });
      const service = await makeService();

      await expect(service.useCredit(7, 10, 55, tx as never)).rejects.toMatchObject({
        message: 'Insufficient credit balance',
        statusCode: 400,
      });
      expect(tx.user.update).not.toHaveBeenCalled();
      expect(tx.creditTransaction.create).not.toHaveBeenCalled();
    });

    it('decrements the balance and records a negative USED transaction tied to the order', async () => {
      const tx = makeTx();
      tx.user.findUnique.mockResolvedValue({ creditBalance: 100 });
      const service = await makeService();

      await service.useCredit(7, 40, 55, tx as never);

      expect(tx.user.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { creditBalance: { decrement: 40 } },
      });
      expect(tx.creditTransaction.create).toHaveBeenCalledWith({
        data: { userId: 7, amount: -40, type: 'USED', orderId: 55 },
      });
    });
  });

  describe('refundCredit', () => {
    it('records a positive REFUNDED transaction tied to the order and increments the balance', async () => {
      const txn = { id: 103, userId: 7, amount: 40, type: 'REFUNDED' };
      prismaMock.creditTransaction.create.mockResolvedValue(txn);
      prismaMock.user.update.mockResolvedValue({ id: 7, creditBalance: 40 });
      const service = await makeService();

      const result = await service.refundCredit(7, 40, 55, 'order cancelled');

      expect(result).toEqual(txn);
      expect(prismaMock.creditTransaction.create).toHaveBeenCalledWith({
        data: { userId: 7, amount: 40, type: 'REFUNDED', orderId: 55, note: 'order cancelled' },
      });
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { creditBalance: { increment: 40 } },
      });
    });
  });

  describe('getCreditTransactions', () => {
    it('annotates each transaction with the staff username that created it', async () => {
      prismaMock.creditTransaction.findMany.mockResolvedValue([
        { id: 1, userId: 7, amount: 25, type: 'ADDED', createdBy: 2 },
        { id: 2, userId: 7, amount: -10, type: 'USED', createdBy: null },
      ]);
      prismaMock.user.findMany.mockResolvedValue([{ id: 2, username: 'manager' }]);
      const service = await makeService();

      const result = await service.getCreditTransactions(7);

      expect(result[0].createdByUsername).toBe('manager');
      expect(result[1].createdByUsername).toBeNull();
      expect(prismaMock.user.findMany).toHaveBeenCalledWith({
        where: { id: { in: [2] } },
        select: { id: true, username: true },
      });
    });

    it('skips the staff lookup when no transaction has a creator', async () => {
      prismaMock.creditTransaction.findMany.mockResolvedValue([
        { id: 2, userId: 7, amount: -10, type: 'USED', createdBy: null },
      ]);
      const service = await makeService();

      const result = await service.getCreditTransactions(7);

      expect(result[0].createdByUsername).toBeNull();
      expect(prismaMock.user.findMany).not.toHaveBeenCalled();
    });
  });
});
