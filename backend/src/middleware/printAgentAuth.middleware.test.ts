import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { hashMachineToken } from '../utils/machineToken';

const VALID_KEY = 'test-print-key-xyz';
const VALID_KEY_HASH = hashMachineToken(VALID_KEY);

const fakeTenant = { id: 99, slug: 'print-tenant', name: 'Print Tenant', status: 'ACTIVE' };
const fakeStore = { id: 3 };

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

const buildReq = (headers: Record<string, string> = {}): Request => ({
  header: (name: string) => headers[name.toLowerCase()] ?? undefined,
  requestId: 'req-print-test',
  originalUrl: '/api/print-jobs/claim',
  method: 'POST',
  headers: {},
} as unknown as Request);

const buildRes = () => ({
  status: vi.fn().mockReturnThis(),
  json: vi.fn().mockReturnThis(),
} as unknown as Response);

describe('authenticatePrintAgent — per-tenant key security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedCtx = null;
    mockPrisma.tenant.findFirst.mockImplementation(({ where }: { where: { printAgentKeyHash?: string } }) => {
      if (where.printAgentKeyHash === VALID_KEY_HASH) return Promise.resolve(fakeTenant);
      return Promise.resolve(null);
    });
    mockPrisma.store.findFirst.mockResolvedValue(fakeStore);
  });

  it('calls next() and sets req.tenantId when the key is valid', async () => {
    const { authenticatePrintAgent } = await import('./printAgentAuth.middleware');
    const req = buildReq({ 'x-print-agent-key': VALID_KEY });
    const res = buildRes();
    const next = vi.fn();

    await authenticatePrintAgent(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledOnce();
    expect((req as any).tenantId).toBe(fakeTenant.id);
  });

  it('returns 401 for an unknown key', async () => {
    const { authenticatePrintAgent } = await import('./printAgentAuth.middleware');
    const req = buildReq({ 'x-print-agent-key': 'totally-wrong-key' });
    const res = buildRes();
    const next = vi.fn();

    await authenticatePrintAgent(req, res, next as NextFunction);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 401 when no key header is present', async () => {
    const { authenticatePrintAgent } = await import('./printAgentAuth.middleware');
    const req = buildReq({});
    const res = buildRes();
    const next = vi.fn();

    await authenticatePrintAgent(req, res, next as NextFunction);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 401 when tenant is SUSPENDED', async () => {
    mockPrisma.tenant.findFirst.mockResolvedValue({ ...fakeTenant, status: 'SUSPENDED' });
    const { authenticatePrintAgent } = await import('./printAgentAuth.middleware');
    const req = buildReq({ 'x-print-agent-key': VALID_KEY });
    const res = buildRes();
    const next = vi.fn();

    await authenticatePrintAgent(req, res, next as NextFunction);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('X-Tenant-ID header cannot override the tenant resolved by the key', async () => {
    const { authenticatePrintAgent } = await import('./printAgentAuth.middleware');
    // Key resolves to tenant 99; provide X-Tenant-ID: 1234 — must be ignored
    const req = buildReq({
      'x-print-agent-key': VALID_KEY,
      'x-tenant-id': '1234',
    });
    const res = buildRes();
    const next = vi.fn();

    await authenticatePrintAgent(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledOnce();
    expect((req as any).tenantId).toBe(99);
    expect((capturedCtx as any)?.tenantId).toBe(99);
  });
});
