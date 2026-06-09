import { describe, expect, it } from 'vitest';
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
    it('contains EXTERNAL, CREDIT, and IN_STORE', () => {
      expect(PaymentMethod.EXTERNAL).toBe('EXTERNAL');
      expect(PaymentMethod.CREDIT).toBe('CREDIT');
      expect(PaymentMethod.IN_STORE).toBe('IN_STORE');
    });

    it('covers all expected payment method values', () => {
      expect(Object.values(PaymentMethod)).toEqual(['EXTERNAL', 'CREDIT', 'IN_STORE']);
    });
  });
});
