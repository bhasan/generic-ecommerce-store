import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PaymentMethodEnum, OrderStatus } from '../../../generated/prisma';
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
