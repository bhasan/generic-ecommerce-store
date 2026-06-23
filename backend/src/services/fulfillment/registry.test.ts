import { describe, it, expect, vi } from 'vitest';
import { DeliveryMethodEnum } from '../../../generated/prisma';
import { getFulfillmentStrategy } from './registry';

vi.mock('../deliveryEligibility.service', () => ({
  DeliveryEligibilityService: vi.fn().mockImplementation(() => ({
    checkDeliveryEligibility: vi.fn().mockResolvedValue({
      deliverable: true,
      canonicalAddress: '123 Main St, Austin, TX 78701',
      deliveryStatus: 'IN_ZONE',
      deliverySource: 'GOOGLE_GEOCODING',
      distanceMiles: 2.5,
      thresholdMiles: 10,
      checkedAt: new Date(),
      message: 'Delivery available',
    }),
  })),
}));

vi.mock('../orderingConstraints.service', () => ({
  OrderingConstraintsService: vi.fn().mockImplementation(() => ({
    getOrderingConstraints: vi.fn().mockResolvedValue({
      minimumDeliveryOrder: 0,
      minimumDeliveryOrderEnabled: false,
    }),
  })),
}));

describe('FulfillmentStrategy registry', () => {
  it('returns a strategy for each known method', () => {
    for (const method of Object.values(DeliveryMethodEnum)) {
      expect(() => getFulfillmentStrategy(method)).not.toThrow();
    }
  });

  it('throws for unknown method', () => {
    expect(() => getFulfillmentStrategy('UNKNOWN' as DeliveryMethodEnum)).toThrow();
  });

  describe('PickupFulfillmentStrategy', () => {
    const strategy = getFulfillmentStrategy(DeliveryMethodEnum.PICKUP);

    it('has correct method', () => expect(strategy.method).toBe(DeliveryMethodEnum.PICKUP));
    it('validate never throws', async () => {
      await expect(strategy.validate({ userId: 1, subtotal: 10 })).resolves.not.toThrow();
    });
    it('buildOrderFields returns empty object', async () => {
      const fields = await strategy.buildOrderFields({ userId: 1, subtotal: 10 });
      expect(fields).toEqual({});
    });
  });

  describe('CurbsideFulfillmentStrategy', () => {
    const strategy = getFulfillmentStrategy(DeliveryMethodEnum.CURBSIDE);

    it('has correct method', () => expect(strategy.method).toBe(DeliveryMethodEnum.CURBSIDE));
    it('validate throws when no vehicleDescription', async () => {
      await expect(strategy.validate({ userId: 1, subtotal: 10 })).rejects.toThrow();
    });
    it('validate passes when vehicleDescription provided', async () => {
      await expect(strategy.validate({ userId: 1, subtotal: 10, vehicleDescription: 'Black Honda Civic' })).resolves.not.toThrow();
    });
    it('buildOrderFields stores vehicleDescription directly', async () => {
      const fields = await strategy.buildOrderFields({ userId: 1, subtotal: 10, vehicleDescription: ' Black Civic ' });
      expect(fields.vehicleDescription).toBe('Black Civic');
      expect(fields.deliveryAddress).toBeUndefined();
    });
    it('onCheckIn returns parkingSpot', async () => {
      const fields = await strategy.onCheckIn!(1, ' A-12 ');
      expect(fields.parkingSpot).toBe('A-12');
    });
  });

  describe('DeliveryFulfillmentStrategy', () => {
    const strategy = getFulfillmentStrategy(DeliveryMethodEnum.DELIVERY);

    it('has correct method', () => expect(strategy.method).toBe(DeliveryMethodEnum.DELIVERY));
    it('validate resolves when address is valid and deliverable', async () => {
      const address = { street: '123 Main St', city: 'Austin', state: 'TX', zipCode: '78701' };
      await expect(strategy.validate({ userId: 1, subtotal: 10, deliveryAddress: address })).resolves.not.toThrow();
    });
    it('validate throws when address is missing', async () => {
      await expect(strategy.validate({ userId: 1, subtotal: 10 })).rejects.toThrow();
    });
  });
});
