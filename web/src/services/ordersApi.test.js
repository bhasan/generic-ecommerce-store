import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api', () => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
}));

describe('ordersApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('posts to the print endpoint and returns the queue result', async () => {
    const api = await import('./api');
    api.post.mockResolvedValue({
      message: 'Order receipt queued for printing',
      result: {
        queued: true,
        reason: 'MANUAL_REPRINT',
        orderId: 55,
      },
    });

    const ordersApi = await import('./ordersApi');
    const result = await ordersApi.printOrderReceipt(55);

    expect(api.post).toHaveBeenCalledWith('/orders/55/print', {});
    expect(result).toEqual({
      queued: true,
      reason: 'MANUAL_REPRINT',
      orderId: 55,
    });
  });

  it('posts to the arrive endpoint with the parking spot and returns order status', async () => {
    const api = await import('./api');
    api.post.mockResolvedValue({
      message: 'Arrival notification sent successfully',
      order: {
        id: 701,
        status: 'ARRIVED',
        deliveryMethod: 'CURBSIDE',
        deliveryAddress: 'CURBSIDE: Blue Civic | SPOT: Space 3',
      },
    });

    const ordersApi = await import('./ordersApi');
    const result = await ordersApi.notifyArrival(701, 'Space 3');

    expect(api.post).toHaveBeenCalledWith('/orders/701/arrive', { parkingSpot: 'Space 3' });
    expect(result).toEqual({
      id: 701,
      status: 'ARRIVED',
      deliveryMethod: 'CURBSIDE',
      deliveryAddress: 'CURBSIDE: Blue Civic | SPOT: Space 3',
    });
  });

  it('posts to the create endpoint and includes deliveryAddress for DELIVERY and CURBSIDE methods', async () => {
    const api = await import('./api');
    api.post.mockResolvedValue({
      id: 801,
      deliveryMethod: 'CURBSIDE',
      deliveryAddress: 'CURBSIDE: Red Model 3',
    });

    const ordersApi = await import('./ordersApi');
    const result = await ordersApi.createOrder([{ productId: 101, quantity: 1 }], 'some_cashapp', 'CURBSIDE', 'IN_STORE', 'CURBSIDE: Red Model 3');

    expect(api.post).toHaveBeenCalledWith('/orders', {
      items: [{ productId: 101, quantity: 1 }],
      cashAppUsername: 'some_cashapp',
      deliveryMethod: 'CURBSIDE',
      paymentMethod: 'IN_STORE',
      deliveryAddress: 'CURBSIDE: Red Model 3',
    });
    expect(result).toEqual({
      id: 801,
      deliveryMethod: 'CURBSIDE',
      deliveryAddress: 'CURBSIDE: Red Model 3',
    });
  });
});

