import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { hashMachineToken } from '../utils/machineToken';

// Pre-computed for determinism: SHA-256('test-token-abc')
const VALID_TOKEN = 'test-token-abc';
const VALID_TOKEN_HASH = hashMachineToken(VALID_TOKEN);

const fakeTenant = { id: 42, slug: 'tenant-a', name: 'Tenant A', status: 'ACTIVE' };
const fakeStore = { id: 7 };

const mockPrisma = {
  tenant: { findFirst: vi.fn() },
  store: { findFirst: vi.fn() },
};

vi.mock('../config/database', () => ({
  default: mockPrisma,
  getUnscopedPrisma: () => mockPrisma,
  getTenantPrisma: () => mockPrisma,
}));

let capturedCtx: unknown = null;
vi.mock('../config/tenantContext', () => ({
  runWithTenant: (ctx: unknown, fn: () => unknown) => {
    capturedCtx = ctx;
    return fn();
  },
  getTenantContext: () => null,
  getTenantContextOrThrow: () => { throw new Error('no context'); },
}));

// Enable reporting API via env.
process.env.ONLINE_STORE_REPORTING_API_ENABLED = 'true';
process.env.ONLINE_STORE_REPORTING_API_RATE_LIMIT_PER_MINUTE = '500';

const buildReq = (overrides: Partial<Request> = {}): Request => ({
  get: (name: string) => {
    const headers: Record<string, string> = (overrides as any)._headers ?? {};
    return headers[name.toLowerCase()] ?? undefined;
  },
  requestId: 'req-test',
  originalUrl: '/api/reporting/v1/health',
  method: 'GET',
  headers: {},
  ...overrides,
} as unknown as Request);

const buildRes = () => {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
};

describe('requireReportingAuth — per-tenant token security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedCtx = null;
    mockPrisma.tenant.findFirst.mockImplementation(({ where }: { where: { reportingTokenHash?: string } }) => {
      if (where.reportingTokenHash === VALID_TOKEN_HASH) return Promise.resolve(fakeTenant);
      return Promise.resolve(null);
    });
    mockPrisma.store.findFirst.mockResolvedValue(fakeStore);
  });

  it('calls next() and sets req.tenantId when the token is valid', async () => {
    const { requireReportingAuth } = await import('./reportingAuth.middleware');
    const req = buildReq({ _headers: { authorization: `Bearer ${VALID_TOKEN}` } } as any);
    const res = buildRes();
    const next = vi.fn();

    await requireReportingAuth(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledOnce();
    expect((req as any).tenantId).toBe(fakeTenant.id);
  });

  it('returns 401 for an unknown token (no matching tenant)', async () => {
    const { requireReportingAuth } = await import('./reportingAuth.middleware');
    const req = buildReq({ _headers: { authorization: 'Bearer unknown-garbage' } } as any);
    const res = buildRes();
    const next = vi.fn();

    await requireReportingAuth(req, res, next as NextFunction);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 401 when no authorization header is present', async () => {
    const { requireReportingAuth } = await import('./reportingAuth.middleware');
    const req = buildReq({ _headers: {} } as any);
    const res = buildRes();
    const next = vi.fn();

    await requireReportingAuth(req, res, next as NextFunction);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 401 when tenant is SUSPENDED', async () => {
    mockPrisma.tenant.findFirst.mockResolvedValue({ ...fakeTenant, status: 'SUSPENDED' });
    const { requireReportingAuth } = await import('./reportingAuth.middleware');
    const req = buildReq({ _headers: { authorization: `Bearer ${VALID_TOKEN}` } } as any);
    const res = buildRes();
    const next = vi.fn();

    await requireReportingAuth(req, res, next as NextFunction);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('X-Tenant-ID header cannot override the tenant resolved by the token', async () => {
    const { requireReportingAuth } = await import('./reportingAuth.middleware');
    // Token resolves to tenant 42; provide X-Tenant-ID: 9999
    const req = buildReq({
      _headers: {
        authorization: `Bearer ${VALID_TOKEN}`,
        'x-tenant-id': '9999',
      },
    } as any);
    const res = buildRes();
    const next = vi.fn();

    await requireReportingAuth(req, res, next as NextFunction);

    // Auth succeeds and the tenant from the token (42) is used, not 9999.
    expect(next).toHaveBeenCalledOnce();
    expect((req as any).tenantId).toBe(42);
    expect((capturedCtx as any)?.tenantId).toBe(42);
  });
});
