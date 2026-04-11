import { DeliveryMethod, PaymentMethod } from './orderMethods';

describe('orderMethods constants', () => {
  describe('DeliveryMethod', () => {
    it('contains DELIVERY and PICKUP', () => {
      expect(DeliveryMethod.DELIVERY).toBe('DELIVERY');
      expect(DeliveryMethod.PICKUP).toBe('PICKUP');
    });

    it('covers all expected delivery method values', () => {
      expect(Object.values(DeliveryMethod)).toEqual(['DELIVERY', 'PICKUP']);
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
