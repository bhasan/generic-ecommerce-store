import { describe, it, expect } from 'vitest';
import { shapeOrderItem, shapeStatusEvents, shapePayments } from './orderResponseShaper';

describe('orderResponseShaper', () => {
  describe('shapeOrderItem', () => {
    it('prefers THUMBNAIL image when multiple images exist', () => {
      const item = {
        id: 1,
        variantId: 10,
        productName: 'Coffee',
        variantLabel: 'Medium',
        quantity: 2,
        unitPrice: { toNumber: () => 5.99 },
        voided: false,
        addedAfterSubmission: false,
        variant: {
          product: {
            id: 100,
            name: 'Coffee',
            images: [
              { url: 'http://example.com/img1.jpg', role: 'GALLERY' },
              { url: 'http://example.com/thumb.jpg', role: 'THUMBNAIL' },
              { url: 'http://example.com/img2.jpg', role: 'GALLERY' },
            ],
          },
        },
      };

      const result = shapeOrderItem(item);

      expect(result.productImage).toBe('http://example.com/thumb.jpg');
      expect(result.product?.image).toBe('http://example.com/thumb.jpg');
    });

    it('falls back to first image when no THUMBNAIL exists', () => {
      const item = {
        id: 1,
        variantId: 10,
        productName: 'Coffee',
        variantLabel: 'Medium',
        quantity: 2,
        unitPrice: { toNumber: () => 5.99 },
        voided: false,
        addedAfterSubmission: false,
        variant: {
          product: {
            id: 100,
            name: 'Coffee',
            images: [
              { url: 'http://example.com/first.jpg', role: 'GALLERY' },
              { url: 'http://example.com/second.jpg', role: 'GALLERY' },
            ],
          },
        },
      };

      const result = shapeOrderItem(item);

      expect(result.productImage).toBe('http://example.com/first.jpg');
      expect(result.product?.image).toBe('http://example.com/first.jpg');
    });

    it('sets productImage to null when no images exist', () => {
      const item = {
        id: 1,
        variantId: 10,
        productName: 'Coffee',
        variantLabel: 'Medium',
        quantity: 2,
        unitPrice: { toNumber: () => 5.99 },
        voided: false,
        addedAfterSubmission: false,
        variant: {
          product: {
            id: 100,
            name: 'Coffee',
            images: [],
          },
        },
      };

      const result = shapeOrderItem(item);

      expect(result.productImage).toBeNull();
      expect(result.product?.image).toBeNull();
    });

    it('sets productImage to null when product is null', () => {
      const item = {
        id: 1,
        variantId: 10,
        productName: 'Coffee',
        variantLabel: 'Medium',
        quantity: 2,
        unitPrice: { toNumber: () => 5.99 },
        voided: false,
        addedAfterSubmission: false,
        variant: null,
      };

      const result = shapeOrderItem(item);

      expect(result.productImage).toBeNull();
      expect(result.product).toBeNull();
    });

    it('provides price alias for backward compatibility', () => {
      const item = {
        id: 1,
        variantId: 10,
        productName: 'Coffee',
        variantLabel: 'Medium',
        quantity: 2,
        unitPrice: 5.99,
        voided: false,
        addedAfterSubmission: false,
        variant: {
          product: {
            id: 100,
            name: 'Coffee',
            images: [],
          },
        },
      };

      const result = shapeOrderItem(item);

      expect(result.price).toBe(result.unitPrice);
      expect(result.price).toBe(5.99);
    });

    it('preserves voided flag', () => {
      const item = {
        id: 1,
        variantId: 10,
        productName: 'Coffee',
        variantLabel: 'Medium',
        quantity: 2,
        unitPrice: 5.99,
        voided: true,
        addedAfterSubmission: false,
        variant: {
          product: {
            id: 100,
            name: 'Coffee',
            images: [],
          },
        },
      };

      const result = shapeOrderItem(item);

      expect(result.voided).toBe(true);
    });

    it('includes all required fields in shaped response', () => {
      const item = {
        id: 1,
        variantId: 10,
        productName: 'Coffee',
        variantLabel: 'Medium',
        quantity: 2,
        unitPrice: 5.99,
        voided: false,
        addedAfterSubmission: true,
        variant: {
          product: {
            id: 100,
            name: 'Coffee',
            images: [{ url: 'http://example.com/img.jpg', role: 'THUMBNAIL' }],
          },
        },
      };

      const result = shapeOrderItem(item);

      expect(result).toHaveProperty('id', 1);
      expect(result).toHaveProperty('variantId', 10);
      expect(result).toHaveProperty('productId', 100);
      expect(result).toHaveProperty('productName', 'Coffee');
      expect(result).toHaveProperty('variantLabel', 'Medium');
      expect(result).toHaveProperty('productImage');
      expect(result).toHaveProperty('quantity', 2);
      expect(result).toHaveProperty('unitPrice');
      expect(result).toHaveProperty('price');
      expect(result).toHaveProperty('voided');
      expect(result).toHaveProperty('addedAfterSubmission', true);
      expect(result).toHaveProperty('product');
    });
  });

  describe('shapeStatusEvents', () => {
    it('maps createdAt Date to ISO string', () => {
      const date = new Date('2024-01-15T10:30:00Z');
      const events = [
        {
          id: 1,
          fromStatus: 'PENDING',
          toStatus: 'CONFIRMED',
          changedBy: 5,
          note: 'Payment confirmed',
          createdAt: date,
        },
      ];

      const result = shapeStatusEvents(events);

      expect(result[0].createdAt).toBe('2024-01-15T10:30:00.000Z');
      expect(typeof result[0].createdAt).toBe('string');
    });

    it('maps null fromStatus correctly', () => {
      const events = [
        {
          id: 1,
          fromStatus: null,
          toStatus: 'PENDING',
          changedBy: 5,
          note: 'Order created',
          createdAt: new Date(),
        },
      ];

      const result = shapeStatusEvents(events);

      expect(result[0].fromStatus).toBeNull();
    });

    it('maps null changedBy correctly', () => {
      const events = [
        {
          id: 1,
          fromStatus: 'PENDING',
          toStatus: 'CONFIRMED',
          changedBy: null,
          note: 'Auto confirmed',
          createdAt: new Date(),
        },
      ];

      const result = shapeStatusEvents(events);

      expect(result[0].changedBy).toBeNull();
    });

    it('maps null note correctly', () => {
      const events = [
        {
          id: 1,
          fromStatus: 'PENDING',
          toStatus: 'CONFIRMED',
          changedBy: 5,
          note: null,
          createdAt: new Date(),
        },
      ];

      const result = shapeStatusEvents(events);

      expect(result[0].note).toBeNull();
    });

    it('handles multiple status events', () => {
      const events = [
        {
          id: 1,
          fromStatus: null,
          toStatus: 'PENDING',
          changedBy: null,
          note: null,
          createdAt: new Date('2024-01-15T10:00:00Z'),
        },
        {
          id: 2,
          fromStatus: 'PENDING',
          toStatus: 'CONFIRMED',
          changedBy: 5,
          note: 'Payment confirmed',
          createdAt: new Date('2024-01-15T11:00:00Z'),
        },
        {
          id: 3,
          fromStatus: 'CONFIRMED',
          toStatus: 'DELIVERED',
          changedBy: 8,
          note: 'Delivered to customer',
          createdAt: new Date('2024-01-15T14:00:00Z'),
        },
      ];

      const result = shapeStatusEvents(events);

      expect(result).toHaveLength(3);
      expect(result[0].toStatus).toBe('PENDING');
      expect(result[1].toStatus).toBe('CONFIRMED');
      expect(result[2].toStatus).toBe('DELIVERED');
    });

    it('preserves all fields in shaped response', () => {
      const events = [
        {
          id: 99,
          fromStatus: 'PENDING',
          toStatus: 'CONFIRMED',
          changedBy: 42,
          note: 'Custom note',
          createdAt: new Date('2024-01-15T10:30:00Z'),
        },
      ];

      const result = shapeStatusEvents(events);

      expect(result[0]).toHaveProperty('id', 99);
      expect(result[0]).toHaveProperty('fromStatus', 'PENDING');
      expect(result[0]).toHaveProperty('toStatus', 'CONFIRMED');
      expect(result[0]).toHaveProperty('changedBy', 42);
      expect(result[0]).toHaveProperty('note', 'Custom note');
      expect(result[0]).toHaveProperty('createdAt');
    });
  });

  describe('shapePayments', () => {
    it('converts Prisma Decimal amount to Number', () => {
      // Prisma Decimal instances are convertible to Number
      const payments = [
        {
          id: 1,
          method: 'CARD',
          status: 'COMPLETED',
          amount: 29.99,
          transactionId: 'TXN-123',
          paymentHandle: 'HANDLE-123',
          createdAt: new Date(),
        },
      ];

      const result = shapePayments(payments);

      expect(result[0].amount).toBe(29.99);
      expect(typeof result[0].amount).toBe('number');
    });

    it('converts plain number amount to Number', () => {
      const payments = [
        {
          id: 1,
          method: 'CASH',
          status: 'COMPLETED',
          amount: 15.50,
          transactionId: null,
          paymentHandle: null,
          createdAt: new Date(),
        },
      ];

      const result = shapePayments(payments);

      expect(result[0].amount).toBe(15.50);
    });

    it('maps null transactionId correctly', () => {
      const payments = [
        {
          id: 1,
          method: 'EXTERNAL',
          status: 'PENDING',
          amount: 50.00,
          transactionId: null,
          paymentHandle: 'HANDLE-456',
          createdAt: new Date(),
        },
      ];

      const result = shapePayments(payments);

      expect(result[0].transactionId).toBeNull();
    });

    it('maps null paymentHandle correctly', () => {
      const payments = [
        {
          id: 1,
          method: 'CHECK',
          status: 'COMPLETED',
          amount: 100.00,
          transactionId: 'CHK-789',
          paymentHandle: null,
          createdAt: new Date(),
        },
      ];

      const result = shapePayments(payments);

      expect(result[0].paymentHandle).toBeNull();
    });

    it('handles multiple payments', () => {
      const payments = [
        {
          id: 1,
          method: 'CARD',
          status: 'COMPLETED',
          amount: 25.00,
          transactionId: 'TXN-001',
          paymentHandle: 'HANDLE-001',
          createdAt: new Date('2024-01-15T10:00:00Z'),
        },
        {
          id: 2,
          method: 'CASH',
          status: 'COMPLETED',
          amount: 10.00,
          transactionId: null,
          paymentHandle: null,
          createdAt: new Date('2024-01-15T10:05:00Z'),
        },
        {
          id: 3,
          method: 'EXTERNAL',
          status: 'PENDING',
          amount: 15.99,
          transactionId: 'EXT-123',
          paymentHandle: null,
          createdAt: new Date('2024-01-15T10:10:00Z'),
        },
      ];

      const result = shapePayments(payments);

      expect(result).toHaveLength(3);
      expect(result[0].amount).toBe(25.00);
      expect(result[1].amount).toBe(10.00);
      expect(result[2].amount).toBe(15.99);
    });

    it('preserves all fields in shaped response', () => {
      const payments = [
        {
          id: 123,
          method: 'CARD',
          status: 'COMPLETED',
          amount: 99.99,
          transactionId: 'TXN-999',
          paymentHandle: 'HANDLE-999',
          createdAt: new Date('2024-01-15T10:30:00Z'),
        },
      ];

      const result = shapePayments(payments);

      expect(result[0]).toHaveProperty('id', 123);
      expect(result[0]).toHaveProperty('method', 'CARD');
      expect(result[0]).toHaveProperty('status', 'COMPLETED');
      expect(result[0]).toHaveProperty('amount', 99.99);
      expect(result[0]).toHaveProperty('transactionId', 'TXN-999');
      expect(result[0]).toHaveProperty('paymentHandle', 'HANDLE-999');
      expect(result[0]).toHaveProperty('createdAt');
    });
  });
});
