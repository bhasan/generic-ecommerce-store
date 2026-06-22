import { describe, it, expect } from 'vitest';
import { DeliveryMethod, PaymentMethod } from './orderMethods';

describe('orderMethods constants', () => {
  describe('DeliveryMethod', () => {
    it('contains DELIVERY, PICKUP, and CURBSIDE', () => {
      expect(DeliveryMethod.DELIVERY).toBe('DELIVERY');
      expect(DeliveryMethod.PICKUP).toBe('PICKUP');
      expect(DeliveryMethod.CURBSIDE).toBe('CURBSIDE');
    });

    it('covers all expected delivery method values', () => {
      expect(Object.values(DeliveryMethod)).toEqual(['DELIVERY', 'PICKUP', 'CURBSIDE']);
    });
  });

  describe('PaymentMethod', () => {
    it('contains EXTERNAL, STORE_CREDIT, IN_STORE, and CC', () => {
      expect(PaymentMethod.EXTERNAL).toBe('EXTERNAL');
      expect(PaymentMethod.STORE_CREDIT).toBe('STORE_CREDIT');
      expect(PaymentMethod.IN_STORE).toBe('IN_STORE');
      expect(PaymentMethod.CC).toBe('CC');
    });

    it('covers all expected payment method values', () => {
      expect(Object.values(PaymentMethod)).toEqual(['EXTERNAL', 'STORE_CREDIT', 'IN_STORE', 'CC']);
    });
  });
});
