import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

const loggerMock = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  logEvent: vi.fn(),
};

vi.mock('../utils/logger', () => ({ logger: loggerMock }));

// Import after mock is registered.
const { requestLogger } = await import('./logger.middleware');

const makeReq = (overrides: Partial<Request> = {}): Request =>
  ({
    headers: {},
    method: 'GET',
    path: '/api/test',
    query: {},
    body: {},
    ip: '127.0.0.1',
    ips: [],
    socket: { remoteAddress: '127.0.0.1' },
    user: undefined,
    app: { get: () => 1 },
    get: (header: string) => (overrides as Record<string, unknown>)[header] ?? null,
    requestId: undefined,
    ...overrides,
  } as unknown as Request);

const makeRes = (): Response & { _headers: Record<string, string>; send: ReturnType<typeof vi.fn> } => {
  const headers: Record<string, string> = {};
  return {
    _headers: headers,
    setHeader: (k: string, v: string) => { headers[k] = v; },
    statusCode: 200,
    send: vi.fn().mockImplementation(function(this: unknown, body: unknown) { return body; }),
  } as unknown as Response & { _headers: Record<string, string>; send: ReturnType<typeof vi.fn> };
};

describe('requestLogger middleware', () => {
  let next: NextFunction;

  beforeEach(() => {
    next = vi.fn();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('request ID assignment', () => {
    it('uses X-Request-Id header when present', () => {
      const req = makeReq({ headers: { 'x-request-id': 'nginx-abc123' } });
      const res = makeRes();
      requestLogger(req, res, next);
      expect(req.requestId).toBe('nginx-abc123');
      expect(res._headers['x-request-id']).toBe('nginx-abc123');
    });

    it('falls back to a generated req_ UUID when header is absent', () => {
      const req = makeReq({ headers: {} });
      const res = makeRes();
      requestLogger(req, res, next);
      expect(req.requestId).toMatch(/^req_[0-9a-f-]{36}$/);
    });

    it('uses the generated ID as the x-request-id response header', () => {
      const req = makeReq();
      const res = makeRes();
      requestLogger(req, res, next);
      expect(res._headers['x-request-id']).toBe(req.requestId);
    });

    it('same requestId appears in both request and response log calls', () => {
      const req = makeReq({ headers: { 'x-request-id': 'trace-xyz' } });
      const res = makeRes();
      requestLogger(req, res, next);
      res.send('ok');

      const requestLog = loggerMock.info.mock.calls.find(([msg]) => msg === 'API Request')?.[1];
      const responseLog = loggerMock.info.mock.calls.find(([msg]) => msg === 'API Response')?.[1];
      expect(requestLog?.requestId).toBe('trace-xyz');
      expect(responseLog?.requestId).toBe('trace-xyz');
    });
  });

  describe('request logging', () => {
    it('calls next()', () => {
      requestLogger(makeReq(), makeRes(), next);
      expect(next).toHaveBeenCalledOnce();
    });

    it('logs method, path, and userId', () => {
      const req = makeReq({ method: 'POST', path: '/api/orders', user: { userId: 7, roles: ['CUSTOMER'] } } as Partial<Request>);
      requestLogger(req, makeRes(), next);
      const log = loggerMock.info.mock.calls.find(([msg]) => msg === 'API Request')?.[1];
      expect(log?.method).toBe('POST');
      expect(log?.path).toBe('/api/orders');
      expect(log?.userId).toBe(7);
    });

    it('labels unauthenticated requests as anonymous', () => {
      requestLogger(makeReq(), makeRes(), next);
      const log = loggerMock.info.mock.calls.find(([msg]) => msg === 'API Request')?.[1];
      expect(log?.userId).toBe('anonymous');
    });
  });

  describe('response logging', () => {
    it('logs statusCode and duration when res.send is called', () => {
      const req = makeReq();
      const res = makeRes();
      requestLogger(req, res, next);
      res.send('body');
      const log = loggerMock.info.mock.calls.find(([msg]) => msg === 'API Response')?.[1];
      expect(log?.statusCode).toBe(200);
      expect(log?.duration).toMatch(/^\d+ms$/);
    });

    it('includes errorBody for 4xx responses', () => {
      const req = makeReq();
      const res = makeRes();
      res.statusCode = 400;
      requestLogger(req, res, next);
      res.send('{"error":"bad request"}');
      const log = loggerMock.info.mock.calls.find(([msg]) => msg === 'API Response')?.[1];
      expect(log?.errorBody).toBeDefined();
    });

    it('does not include errorBody for 2xx responses', () => {
      const req = makeReq();
      const res = makeRes();
      requestLogger(req, res, next);
      res.send('ok');
      const log = loggerMock.info.mock.calls.find(([msg]) => msg === 'API Response')?.[1];
      expect(log?.errorBody).toBeUndefined();
    });
  });

  describe('body sanitization', () => {
    it('redacts password field', () => {
      const req = makeReq({ method: 'POST', body: { username: 'alice', password: 'secret' } });
      requestLogger(req, makeRes(), next);
      const log = loggerMock.info.mock.calls.find(([msg]) => msg === 'API Request')?.[1];
      expect(log?.body?.password).toBe('[REDACTED]');
      expect(log?.body?.username).toBe('alice');
    });

    it('redacts token and authToken fields', () => {
      const req = makeReq({ method: 'POST', body: { token: 'tok', authToken: 'tok2', data: 'ok' } });
      requestLogger(req, makeRes(), next);
      const log = loggerMock.info.mock.calls.find(([msg]) => msg === 'API Request')?.[1];
      expect(log?.body?.token).toBe('[REDACTED]');
      expect(log?.body?.authToken).toBe('[REDACTED]');
      expect(log?.body?.data).toBe('ok');
    });

    it('does not log body for GET requests', () => {
      const req = makeReq({ method: 'GET', body: { hidden: 'value' } });
      requestLogger(req, makeRes(), next);
      const log = loggerMock.info.mock.calls.find(([msg]) => msg === 'API Request')?.[1];
      expect(log?.body).toBeUndefined();
    });
  });
});
