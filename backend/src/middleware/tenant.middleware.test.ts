// backend/src/middleware/tenant.middleware.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';

const tenantFindUnique = vi.fn();
const tenantFindFirst = vi.fn();
const findStore = vi.fn();
vi.mock('../config/database', () => ({
  getUnscopedPrisma: () => ({
    tenant: { findUnique: tenantFindUnique, findFirst: tenantFindFirst },
    store: { findFirst: findStore },
  }),
}));

import { resolveTenant } from './tenant.middleware';

const ACTIVE = (id: number, slug: string) => ({ id, slug, status: 'ACTIVE' });

function mk(hostname: string, headers: Record<string, string> = {}) {
  const req: any = { hostname, headers };
  const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  const next = vi.fn();
  return { req, res, next };
}

function bearer(tenantId: number | null) {
  return { authorization: `Bearer ${jwt.sign({ tenantId }, 'test-secret')}` };
}

describe('resolveTenant', () => {
  beforeEach(() => {
    tenantFindUnique.mockReset();
    tenantFindFirst.mockReset();
    findStore.mockReset();
    findStore.mockResolvedValue({ id: 5 });
  });

  it('resolves an active tenant from a named subdomain and calls next inside context', async () => {
    tenantFindFirst.mockResolvedValue(ACTIVE(1, 'acme'));
    const { req, res, next } = mk('acme.yourapp.com');
    await resolveTenant(req, res, next);
    expect(req.tenantId).toBe(1);
    expect(req.store.id).toBe(5);
    expect(next).toHaveBeenCalled();
  });

  it('404s an unknown named subdomain', async () => {
    tenantFindFirst.mockResolvedValue(null);
    const { req, res, next } = mk('nope.yourapp.com');
    await resolveTenant(req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });

  it('403s a suspended tenant', async () => {
    tenantFindFirst.mockResolvedValue({ id: 1, slug: 'acme', status: 'SUSPENDED' });
    const { req, res, next } = mk('acme.yourapp.com');
    await resolveTenant(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('maps the `admin` subdomain to the super-admin scope (no tenant)', async () => {
    const { req, res, next } = mk('admin.yourapp.com');
    await resolveTenant(req, res, next);
    expect(req.tenantId).toBeNull();
    expect(next).toHaveBeenCalled();
    expect(tenantFindFirst).not.toHaveBeenCalled();
  });

  // --- priority: HOST beats JWT --------------------------------------------
  it('lets the HOST win over the JWT (token for tenant 99 on acme subdomain → acme)', async () => {
    tenantFindFirst.mockResolvedValue(ACTIVE(1, 'acme')); // host lookup
    tenantFindUnique.mockResolvedValue(ACTIVE(99, 'other')); // would be the JWT tenant
    const { req, res, next } = mk('acme.yourapp.com', bearer(99));
    await resolveTenant(req, res, next);
    expect(req.tenantId).toBe(1);              // host (acme), NOT the token's tenant 99
    expect(tenantFindUnique).not.toHaveBeenCalled(); // JWT branch never consulted
    expect(next).toHaveBeenCalled();
  });

  // --- priority: JWT fallback on localhost/apex (dev workflow) --------------
  it('falls back to the JWT tenant on localhost (no subdomain) for a logged-in user', async () => {
    tenantFindFirst.mockResolvedValue(null);   // no custom-domain match for localhost
    tenantFindUnique.mockResolvedValue(ACTIVE(7, 'devtenant'));
    const { req, res, next } = mk('localhost', bearer(7));
    await resolveTenant(req, res, next);
    expect(req.tenantId).toBe(7);
    expect(tenantFindUnique).toHaveBeenCalledWith({ where: { id: 7 } });
    expect(next).toHaveBeenCalled();
  });

  // --- priority: default tenant on apex/localhost anonymous ----------------
  it('falls back to the default tenant (slug app) on localhost with no token', async () => {
    tenantFindFirst.mockImplementation(async (args: any) => {
      if (args.where?.slug === 'app') return ACTIVE(1, 'app');
      return null; // customDomain:localhost → none
    });
    const { req, res, next } = mk('localhost');
    await resolveTenant(req, res, next);
    expect(req.tenantId).toBe(1);
    expect(tenantFindFirst).toHaveBeenCalledWith({ where: { slug: 'app' } });
    expect(next).toHaveBeenCalled();
  });

  // --- priority: explicit header override (highest) ------------------------
  it('honors X-Tenant-Slug header over everything else (dev/API override)', async () => {
    tenantFindFirst.mockResolvedValue(ACTIVE(3, 'beta'));
    const { req, res, next } = mk('acme.yourapp.com', { 'x-tenant-slug': 'beta', ...bearer(99) });
    await resolveTenant(req, res, next);
    expect(req.tenantId).toBe(3);
    expect(tenantFindFirst).toHaveBeenCalledWith({ where: { slug: 'beta' } });
    expect(next).toHaveBeenCalled();
  });

  it('resolves X-Tenant-ID header via findUnique', async () => {
    tenantFindUnique.mockResolvedValue(ACTIVE(42, 'forty-two'));
    const { req, res, next } = mk('localhost', { 'x-tenant-id': '42' });
    await resolveTenant(req, res, next);
    expect(req.tenantId).toBe(42);
    expect(tenantFindUnique).toHaveBeenCalledWith({ where: { id: 42 } });
  });

  it('404s an explicit header for a tenant that does not exist', async () => {
    tenantFindFirst.mockResolvedValue(null);
    const { req, res, next } = mk('localhost', { 'x-tenant-slug': 'ghost' });
    await resolveTenant(req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });

  describe('active store selection (X-Store-Id)', () => {
    const wireStores = (opts: { selected?: any; def?: any }) => {
      // store.findFirst serves BOTH the selected-store lookup (where: { id, tenantId,
      // status }) and the default-store lookup (where: { isDefault: true, ... });
      // disambiguate on `isDefault`. `?? null` normalizes an unset opt to null (Prisma's
      // "not found"); the no-header test never reaches the selected branch anyway.
      findStore.mockImplementation(async (args: any) => {
        if (args.where?.isDefault) return opts.def ?? null;
        return opts.selected ?? null;
      });
    };

    it('uses the X-Store-Id store when it belongs to the tenant and is active', async () => {
      tenantFindFirst.mockResolvedValue(ACTIVE(1, 'acme'));
      wireStores({ selected: { id: 9 }, def: { id: 5 } });
      const { req, res, next } = mk('acme.yourapp.com', { 'x-store-id': '9' });
      await resolveTenant(req, res, next);
      expect(req.store.id).toBe(9);
      expect(next).toHaveBeenCalled();
    });

    it('falls back to the default store when X-Store-Id is foreign/inactive', async () => {
      tenantFindFirst.mockResolvedValue(ACTIVE(1, 'acme'));
      wireStores({ selected: null, def: { id: 5 } });
      const { req, res, next } = mk('acme.yourapp.com', { 'x-store-id': '999' });
      await resolveTenant(req, res, next);
      expect(req.store.id).toBe(5);
    });

    it('uses the default store when no X-Store-Id header is present', async () => {
      tenantFindFirst.mockResolvedValue(ACTIVE(1, 'acme'));
      wireStores({ def: { id: 5 } });
      const { req, res, next } = mk('acme.yourapp.com');
      await resolveTenant(req, res, next);
      expect(req.store.id).toBe(5);
    });

    it('ignores a non-numeric X-Store-Id and uses the default store', async () => {
      tenantFindFirst.mockResolvedValue(ACTIVE(1, 'acme'));
      wireStores({ selected: { id: 9 }, def: { id: 5 } });
      const { req, res, next } = mk('acme.yourapp.com', { 'x-store-id': 'abc' });
      await resolveTenant(req, res, next);
      expect(req.store.id).toBe(5);
    });
  });
});
