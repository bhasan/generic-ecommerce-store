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
});
