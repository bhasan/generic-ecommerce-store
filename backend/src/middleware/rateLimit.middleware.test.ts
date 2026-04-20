import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const logger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('../utils/logger', () => ({
  logger,
}));

const requestJson = async (
  server: ReturnType<typeof express.application.listen>,
  path: string,
  init?: RequestInit
) => {
  const { port } = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${port}${path}`, init);
  const body = await response.json();
  return { response, body };
};

const loadRateLimiterModule = async () => {
  vi.resetModules();
  return import('./rateLimit.middleware');
};

describe('rateLimit middleware', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = 'test';
    process.env.GENERAL_RATE_LIMIT_MAX = '1';
    process.env.GENERAL_RATE_LIMIT_WINDOW_MS = '60000';
    process.env.POLL_RATE_LIMIT_MAX = '1';
    process.env.POLL_RATE_LIMIT_WINDOW_MS = '60000';
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    for (const [key, value] of Object.entries(originalEnv)) {
      if (typeof value === 'undefined') {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('assigns polling limiter only to designated read endpoints', async () => {
    const { resolveLimiterName } = await loadRateLimiterModule();

    expect(resolveLimiterName({ method: 'GET', baseUrl: '/api/orders', path: '/' } as any)).toBe('polling');
    expect(resolveLimiterName({ method: 'GET', baseUrl: '/api/orders', path: '/ready-for-delivery' } as any)).toBe('polling');
    expect(resolveLimiterName({ method: 'GET', baseUrl: '/api/notifications', path: '/' } as any)).toBe('polling');
    expect(resolveLimiterName({ method: 'GET', baseUrl: '/api/notifications', path: '/unread-count' } as any)).toBe('polling');
    expect(resolveLimiterName({ method: 'GET', baseUrl: '/api/notifications', path: '/staff' } as any)).toBe('polling');
    expect(resolveLimiterName({ method: 'GET', baseUrl: '/api/contact', path: '/messages/count' } as any)).toBe('polling');

    expect(resolveLimiterName({ method: 'POST', baseUrl: '/api/orders', path: '/' } as any)).toBe('general');
    expect(resolveLimiterName({ method: 'PATCH', baseUrl: '/api/notifications', path: '/read-all' } as any)).toBe('general');
    expect(resolveLimiterName({ method: 'GET', baseUrl: '/api/products', path: '/' } as any)).toBe('general');
  });

  it('returns 429 with structured payload and logging for general limiter', async () => {
    const { readWriteLimiter } = await loadRateLimiterModule();
    const app = express();
    app.use((req, _res, next) => {
      req.requestId = 'req-general-limit';
      next();
    });
    app.get('/api/products', readWriteLimiter, (_req, res) => res.status(200).json({ ok: true }));

    const server = app.listen(0);
    try {
      const first = await requestJson(server, '/api/products');
      expect(first.response.status).toBe(200);

      const second = await requestJson(server, '/api/products');
      expect(second.response.status).toBe(429);
      expect(second.body).toEqual({
        error: {
          message: 'Too many requests, please try again later.',
          code: 'RATE_LIMITED',
          requestId: 'req-general-limit',
        },
      });
      expect(second.response.headers.get('ratelimit-limit')).toBe('1');

      expect(logger.warn).toHaveBeenCalledWith(
        'Rate limit exceeded',
        expect.objectContaining({
          limiterName: 'general',
          method: 'GET',
          path: '/api/products',
          requestId: 'req-general-limit',
        })
      );
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
  });

  it('uses polling limiter for poll endpoints and logs limiterName=polling on 429', async () => {
    const { readWriteLimiter } = await loadRateLimiterModule();
    const app = express();
    app.use((req, _res, next) => {
      req.requestId = 'req-polling-limit';
      next();
    });
    app.get('/api/orders', readWriteLimiter, (_req, res) => res.status(200).json({ ok: true }));

    const server = app.listen(0);
    try {
      const first = await requestJson(server, '/api/orders');
      expect(first.response.status).toBe(200);

      const second = await requestJson(server, '/api/orders');
      expect(second.response.status).toBe(429);

      expect(logger.warn).toHaveBeenCalledWith(
        'Rate limit exceeded',
        expect.objectContaining({
          limiterName: 'polling',
          path: '/api/orders',
          requestId: 'req-polling-limit',
        })
      );
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
  });
});
