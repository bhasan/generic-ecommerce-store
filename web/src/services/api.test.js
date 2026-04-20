import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('api service', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('preserves requestId and status on backend errors', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      url: 'http://localhost/api/test',
      headers: {
        get: () => 'application/json',
      },
      json: async () => ({
        error: {
          message: 'Boom',
          code: 'INTERNAL_ERROR',
          requestId: 'req-123',
        },
      }),
    });

    const { get } = await import('./api.js');

    await expect(get('/test')).rejects.toMatchObject({
      message: 'Boom',
      status: 500,
      code: 'INTERNAL_ERROR',
      requestId: 'req-123',
      responseUrl: 'http://localhost/api/test',
    });
  });

  it('classifies network errors without dropping requestId field', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const { get } = await import('./api.js');

    await expect(get('/test', { retries: 0 })).rejects.toMatchObject({
      message: 'Network error. Please check your connection.',
      code: 'NETWORK_ERROR',
    });
  });

  it('does not retry HTTP 429 responses', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      url: 'http://localhost/api/test',
      headers: {
        get: () => 'application/json',
      },
      json: async () => ({
        error: {
          message: 'Too many requests, please slow down.',
          code: 'RATE_LIMITED',
          requestId: 'req-429',
        },
      }),
    });

    const { get } = await import('./api.js');

    await expect(get('/test', { retries: 2 })).rejects.toMatchObject({
      status: 429,
      code: 'RATE_LIMITED',
      requestId: 'req-429',
      message: 'Too many requests, please slow down.',
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});
