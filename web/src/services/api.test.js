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

  it('ignores stale 401 responses that belong to an older session token', async () => {
    localStorage.setItem('authToken', 'token-a');
    localStorage.setItem('userData', JSON.stringify({ id: 1, username: 'customer-one' }));

    let resolveFetch;
    globalThis.fetch = vi.fn().mockImplementation(() => new Promise((resolve) => {
      resolveFetch = resolve;
    }));

    const unauthorizedSpy = vi.fn();
    window.addEventListener('auth:unauthorized', unauthorizedSpy);

    const { get } = await import('./api.js');

    const pendingRequest = get('/test', { retries: 0 }).catch((error) => error);

    // Simulate the user signing back in before the old request completes.
    localStorage.setItem('authToken', 'token-b');
    localStorage.setItem('userData', JSON.stringify({ id: 2, username: 'customer-two' }));

    resolveFetch({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      url: 'http://localhost/api/test',
      headers: {
        get: () => 'application/json',
      },
      json: async () => ({
        error: {
          message: 'Session expired',
          code: 'SESSION_EXPIRED',
          requestId: 'req-old-session',
        },
      }),
    });

    const error = await pendingRequest;

    expect(error).toMatchObject({
      status: 401,
      code: 'SESSION_EXPIRED',
      requestId: 'req-old-session',
      message: 'Session expired',
    });
    expect(localStorage.getItem('authToken')).toBe('token-b');
    expect(JSON.parse(localStorage.getItem('userData'))).toMatchObject({
      id: 2,
      username: 'customer-two',
    });
    expect(unauthorizedSpy).not.toHaveBeenCalled();

    window.removeEventListener('auth:unauthorized', unauthorizedSpy);
  });

  it('still auto-logs out on a 401 for the active session token', async () => {
    localStorage.setItem('authToken', 'token-a');
    localStorage.setItem('userData', JSON.stringify({ id: 1, username: 'customer-one' }));

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      url: 'http://localhost/api/test',
      headers: {
        get: () => 'application/json',
      },
      json: async () => ({
        error: {
          message: 'Session expired',
          code: 'SESSION_EXPIRED',
          requestId: 'req-current-session',
        },
      }),
    });

    const unauthorizedSpy = vi.fn();
    window.addEventListener('auth:unauthorized', unauthorizedSpy);

    const { get } = await import('./api.js');

    await expect(get('/test', { retries: 0 })).rejects.toMatchObject({
      status: 401,
      code: 'SESSION_EXPIRED',
      requestId: 'req-current-session',
      message: 'Session expired',
    });
    expect(localStorage.getItem('authToken')).toBeNull();
    expect(localStorage.getItem('userData')).toBeNull();
    expect(unauthorizedSpy).toHaveBeenCalledTimes(1);

    window.removeEventListener('auth:unauthorized', unauthorizedSpy);
  });
});
