import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
}));

vi.mock('./api', () => api);

import * as ordersApi from './ordersApi';

describe('ordersApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('posts to the print endpoint and returns the queue result', async () => {
    api.post.mockResolvedValue({
      result: {
        queued: true,
        reason: 'MANUAL_REPRINT',
        orderId: 55,
      },
    });

    const result = await ordersApi.printOrderReceipt(55);

    expect(api.post).toHaveBeenCalledWith('/orders/55/print', {});
    expect(result).toEqual({
      queued: true,
      reason: 'MANUAL_REPRINT',
      orderId: 55,
    });
  });

  it('posts to the arrive endpoint with the parking spot and returns order status', async () => {
    api.post.mockResolvedValue({
      order: {
        id: 701,
        status: 'ARRIVED',
        deliveryMethod: 'CURBSIDE',
        deliveryAddress: 'CURBSIDE: Blue Civic | SPOT: Space 3',
      },
    });

    const result = await ordersApi.notifyArrival(701, 'Space 3');

    expect(api.post).toHaveBeenCalledWith('/orders/701/arrive', { parkingSpot: 'Space 3' });
    expect(result).toEqual({
      order: {
        id: 701,
        status: 'ARRIVED',
        deliveryMethod: 'CURBSIDE',
        deliveryAddress: 'CURBSIDE: Blue Civic | SPOT: Space 3',
      },
    });
  });

  it('posts to the create endpoint and includes vehicleDescription for CURBSIDE orders', async () => {
    api.post.mockResolvedValue({ order: { id: 801, deliveryMethod: 'CURBSIDE' } });

    const result = await ordersApi.createOrder(
      [{ productId: 101, quantity: 1 }], 'some_cashapp', 'CURBSIDE', 'IN_STORE',
      undefined, 'Red Tesla Model 3'
    );

    expect(api.post).toHaveBeenCalledWith('/orders', {
      items: [{ productId: 101, quantity: 1 }],
      cashAppUsername: 'some_cashapp',
      deliveryMethod: 'CURBSIDE',
      paymentMethod: 'IN_STORE',
      vehicleDescription: 'Red Tesla Model 3',
    });
    expect(result).toEqual({ id: 801, deliveryMethod: 'CURBSIDE' });
  });
});
