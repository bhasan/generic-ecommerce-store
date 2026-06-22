import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PaymentMethodEnum, OrderStatus, PaymentStatus, Prisma } from '../../../generated/prisma';
import { getPaymentStrategy } from './registry';
import { DeliveryMethod } from '../../constants/orderMethods';

vi.mock('../credit.service', () => ({
  default: {
    useCredit: vi.fn(),
    refundCredit: vi.fn(),
  },
}));

describe('PaymentStrategy registry', () => {
  describe('getPaymentStrategy', () => {
    it('returns a strategy for each known method', () => {
      for (const method of Object.values(PaymentMethodEnum)) {
        expect(() => getPaymentStrategy(method)).not.toThrow();
      }
    });

    it('throws for unknown method', () => {
      expect(() => getPaymentStrategy('UNKNOWN' as PaymentMethodEnum)).toThrow();
    });
  });

  describe('ExternalPaymentStrategy', () => {
    const strategy = getPaymentStrategy(PaymentMethodEnum.EXTERNAL);

    it('has correct method', () => expect(strategy.method).toBe(PaymentMethodEnum.EXTERNAL));
    it('initialStatus is PENDING', () => expect(strategy.initialStatus()).toBe(OrderStatus.PENDING));
    it('notifiesOnCreate is true', () => expect(strategy.notifiesOnCreate()).toBe(true));
    it('validate never throws', () => {
      expect(() => strategy.validate({ userId: 1, deliveryMethod: 'DELIVERY', total: 10 })).not.toThrow();
    });

    it('applyInTransaction creates a PENDING payment row with cashAppUsername as paymentHandle', async () => {
      const tx = { payment: { create: vi.fn() } };
      await strategy.applyInTransaction(tx, 42, { userId: 1, deliveryMethod: 'DELIVERY', total: 25, cashAppUsername: '$johndoe' });
      expect(tx.payment.create).toHaveBeenCalledWith({
        data: {
          orderId: 42,
          method: PaymentMethodEnum.EXTERNAL,
          status: PaymentStatus.PENDING,
          amount: new Prisma.Decimal(25),
          paymentHandle: '$johndoe',
        },
      });
    });

    it('applyInTransaction sets paymentHandle to null when cashAppUsername is absent', async () => {
      const tx = { payment: { create: vi.fn() } };
      await strategy.applyInTransaction(tx, 42, { userId: 1, deliveryMethod: 'DELIVERY', total: 25 });
      expect(tx.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ paymentHandle: null }) }),
      );
    });
  });

  describe('CreditPaymentStrategy', () => {
    const strategy = getPaymentStrategy(PaymentMethodEnum.CREDIT);

    it('has correct method', () => expect(strategy.method).toBe(PaymentMethodEnum.CREDIT));
    it('initialStatus is PENDING', () => expect(strategy.initialStatus()).toBe(OrderStatus.PENDING));
    it('notifiesOnCreate is true', () => expect(strategy.notifiesOnCreate()).toBe(true));

    it('validate never throws — balance enforcement is deferred to useCredit in the transaction', () => {
      expect(() => strategy.validate({ userId: 1, deliveryMethod: 'PICKUP', total: 50 })).not.toThrow();
      expect(() => strategy.validate({ userId: 1, deliveryMethod: 'PICKUP', total: 0 })).not.toThrow();
    });

    it('applyInTransaction creates a SETTLED payment row after useCredit', async () => {
      const tx = { payment: { create: vi.fn() } };
      await strategy.applyInTransaction(tx, 42, { userId: 1, deliveryMethod: 'PICKUP', total: 30 });
      expect(tx.payment.create).toHaveBeenCalledWith({
        data: {
          orderId: 42,
          method: PaymentMethodEnum.CREDIT,
          status: PaymentStatus.SETTLED,
          amount: new Prisma.Decimal(30),
          paymentHandle: null,
        },
      });
    });
  });

  describe('InStorePaymentStrategy', () => {
    const strategy = getPaymentStrategy(PaymentMethodEnum.IN_STORE);

    it('has correct method', () => expect(strategy.method).toBe(PaymentMethodEnum.IN_STORE));
    it('initialStatus is PENDING', () => expect(strategy.initialStatus()).toBe(OrderStatus.PENDING));
    it('notifiesOnCreate is true', () => expect(strategy.notifiesOnCreate()).toBe(true));

    it('validate throws for delivery method', () => {
      expect(() => strategy.validate({ userId: 1, deliveryMethod: DeliveryMethod.DELIVERY, total: 10 })).toThrow();
    });

    it('validate passes for pickup', () => {
      expect(() => strategy.validate({ userId: 1, deliveryMethod: DeliveryMethod.PICKUP, total: 10 })).not.toThrow();
    });

    it('validate passes for curbside', () => {
      expect(() => strategy.validate({ userId: 1, deliveryMethod: DeliveryMethod.CURBSIDE, total: 10 })).not.toThrow();
    });

    it('applyInTransaction creates a PENDING payment row', async () => {
      const tx = { payment: { create: vi.fn() } };
      await strategy.applyInTransaction(tx, 99, { userId: 1, deliveryMethod: DeliveryMethod.PICKUP, total: 15 });
      expect(tx.payment.create).toHaveBeenCalledWith({
        data: {
          orderId: 99,
          method: PaymentMethodEnum.IN_STORE,
          status: PaymentStatus.PENDING,
          amount: new Prisma.Decimal(15),
          paymentHandle: null,
        },
      });
    });
  });

  describe('CcPaymentStrategy', () => {
    const strategy = getPaymentStrategy(PaymentMethodEnum.CC);

    it('has correct method', () => expect(strategy.method).toBe(PaymentMethodEnum.CC));
    it('initialStatus is PENDING_PAYMENT', () => expect(strategy.initialStatus()).toBe(OrderStatus.PENDING_PAYMENT));
    it('notifiesOnCreate is false', () => expect(strategy.notifiesOnCreate()).toBe(false));
    it('validate never throws', () => {
      expect(() => strategy.validate({ userId: 1, deliveryMethod: 'DELIVERY', total: 10 })).not.toThrow();
    });
  });
});
