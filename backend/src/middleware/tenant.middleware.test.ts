// backend/src/middleware/tenant.middleware.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const findTenant = vi.fn();
const findStore = vi.fn();
vi.mock('../config/database', () => ({
  getUnscopedPrisma: () => ({
    tenant: { findUnique: findTenant, findFirst: findTenant },
    store: { findFirst: findStore },
  }),
}));

import { resolveTenant } from './tenant.middleware';

function mk(hostname: string) {
  const req: any = { hostname, headers: {} };
  const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  const next = vi.fn();
  return { req, res, next };
}

describe('resolveTenant', () => {
  beforeEach(() => { findTenant.mockReset(); findStore.mockReset(); });

  it('404s an unknown subdomain', async () => {
    findTenant.mockResolvedValue(null);
    const { req, res, next } = mk('nope.yourapp.com');
    await resolveTenant(req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });

  it('403s a suspended tenant', async () => {
    findTenant.mockResolvedValue({ id: 1, slug: 'acme', status: 'SUSPENDED' });
    const { req, res, next } = mk('acme.yourapp.com');
    await resolveTenant(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('resolves an active tenant and calls next inside context', async () => {
    findTenant.mockResolvedValue({ id: 1, slug: 'acme', status: 'ACTIVE' });
    findStore.mockResolvedValue({ id: 5 });
    const { req, res, next } = mk('acme.yourapp.com');
    await resolveTenant(req, res, next);
    expect(req.tenantId).toBe(1);
    expect(req.store.id).toBe(5);
    expect(next).toHaveBeenCalled();
  });
});
