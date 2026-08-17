// backend/src/integration/tenantManagement.routes.test.ts
//
// Security-critical gate test: proves that the tenantManagement routes enforce
// SUPER_ADMIN-only access through the full middleware stack (authenticate →
// requireSuperAdmin → controller), not just at the middleware unit level.
//
// Pattern mirrors rbac.routes.test.ts: only the JWT decode is mocked so the
// real authenticate + requireSuperAdmin run against forged role claims. The
// controller is stubbed to return 200/201 — this test is about the GATE, not
// the DB. A cross-tenant privilege escalation via a regular ADMIN token must
// never be able to reach the tenant management controller.

import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../middleware/error.middleware';
import { setDefaultTenantId } from '../config/defaultTenant';

const verifyToken = vi.hoisted(() => vi.fn());
const extractTokenFromHeader = vi.hoisted(() =>
  vi.fn((header?: string) => (header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null)),
);
const logger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }));

// Controller stubs — authorized requests pass through to these; forbidden /
// unauthenticated requests are rejected before they reach here.
const controllerStub = vi.hoisted(() => ({
  list: vi.fn((_req: any, res: any) => res.status(200).json({ data: [] })),
  create: vi.fn((_req: any, res: any) => res.status(201).json({ data: {} })),
  setStatus: vi.fn((_req: any, res: any) => res.status(200).json({ data: {} })),
  regenerateTokens: vi.fn((_req: any, res: any) => res.status(200).json({ data: {} })),
  update: vi.fn((_req: any, res: any) => res.status(200).json({ data: {} })),
  remove: vi.fn((_req: any, res: any) => res.status(200).json({ data: {} })),
  audit: vi.fn((_req: any, res: any) => res.status(200).json({ data: [] })),
}));

vi.mock('../utils/jwt.util', () => ({ verifyToken, extractTokenFromHeader }));
vi.mock('../utils/logger', () => ({ logger }));
vi.mock('../controllers/tenantManagement.controller', () => ({
  tenantManagementController: controllerStub,
}));

const createServer = async () => {
  const { default: tenantManagementRoutes } = await import('../routes/tenantManagement.routes');

  const app = express();
  app.use(express.json());
  // Mirrors index.ts line: `app.use('/api/admin/tenants', generalLimiter, tenantManagementRoutes)`
  // (limiter omitted in tests). authenticate is applied inside the route file itself.
  app.use((req, _res, next) => {
    req.requestId = 'req-tenant-mgmt';
    next();
  });
  app.use('/api/admin/tenants', tenantManagementRoutes);
  app.use(errorHandler);
  return app.listen(0);
};

type Server = Awaited<ReturnType<typeof createServer>>;

const call = async (
  server: Server,
  method: string,
  path: string,
  opts: { roles?: string[]; body?: unknown } = {},
) => {
  const { port } = server.address() as AddressInfo;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.roles) {
    verifyToken.mockReturnValue({
      userId: 1,
      username: 'test-user',
      roles: opts.roles,
      tenantId: opts.roles.includes('SUPER_ADMIN') ? null : 1,
    });
    headers.Authorization = 'Bearer forged-token';
  }
  return fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
};

describe('tenant-management route gate (SUPER_ADMIN only)', () => {
  let server: Server;

  beforeEach(async () => {
    vi.clearAllMocks();
    setDefaultTenantId(1);
    server = await createServer();
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  // ── No token → 401 ───────────────────────────────────────────────────────────

  describe('unauthenticated requests', () => {
    it('GET / → 401', async () => {
      const res = await call(server, 'GET', '/api/admin/tenants');
      expect(res.status).toBe(401);
      expect(controllerStub.list).not.toHaveBeenCalled();
    });

    it('POST / → 401', async () => {
      const res = await call(server, 'POST', '/api/admin/tenants', {
        body: { slug: 'x', name: 'X', adminUsername: 'u', adminPassword: 'p' },
      });
      expect(res.status).toBe(401);
      expect(controllerStub.create).not.toHaveBeenCalled();
    });

    it('PATCH /:id/status → 401', async () => {
      const res = await call(server, 'PATCH', '/api/admin/tenants/1/status', {
        body: { status: 'ACTIVE' },
      });
      expect(res.status).toBe(401);
      expect(controllerStub.setStatus).not.toHaveBeenCalled();
    });

    it('POST /:id/regenerate-tokens → 401', async () => {
      const res = await call(server, 'POST', '/api/admin/tenants/1/regenerate-tokens');
      expect(res.status).toBe(401);
      expect(controllerStub.regenerateTokens).not.toHaveBeenCalled();
    });

    it('PATCH /:id → 401', async () => {
      const res = await call(server, 'PATCH', '/api/admin/tenants/1', { body: { name: 'X' } });
      expect(res.status).toBe(401);
      expect(controllerStub.update).not.toHaveBeenCalled();
    });

    it('DELETE /:id → 401', async () => {
      const res = await call(server, 'DELETE', '/api/admin/tenants/1');
      expect(res.status).toBe(401);
      expect(controllerStub.remove).not.toHaveBeenCalled();
    });

    it('GET /audit → 401', async () => {
      const res = await call(server, 'GET', '/api/admin/tenants/audit');
      expect(res.status).toBe(401);
      expect(controllerStub.audit).not.toHaveBeenCalled();
    });
  });

  // ── Regular ADMIN → 403 (must never manage all tenants) ─────────────────────

  describe('ADMIN (per-tenant) rejected with 403', () => {
    it('GET / → 403, controller NOT reached', async () => {
      const res = await call(server, 'GET', '/api/admin/tenants', { roles: ['ADMIN'] });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toMatch(/super administrator/i);
      expect(controllerStub.list).not.toHaveBeenCalled();
    });

    it('POST / → 403, controller NOT reached', async () => {
      const res = await call(server, 'POST', '/api/admin/tenants', {
        roles: ['ADMIN'],
        body: { slug: 'x', name: 'X', adminUsername: 'u', adminPassword: 'p' },
      });
      expect(res.status).toBe(403);
      expect(controllerStub.create).not.toHaveBeenCalled();
    });

    it('PATCH /:id/status → 403, controller NOT reached', async () => {
      const res = await call(server, 'PATCH', '/api/admin/tenants/1/status', {
        roles: ['ADMIN'],
        body: { status: 'ACTIVE' },
      });
      expect(res.status).toBe(403);
      expect(controllerStub.setStatus).not.toHaveBeenCalled();
    });

    it('POST /:id/regenerate-tokens → 403, controller NOT reached', async () => {
      const res = await call(server, 'POST', '/api/admin/tenants/1/regenerate-tokens', {
        roles: ['ADMIN'],
      });
      expect(res.status).toBe(403);
      expect(controllerStub.regenerateTokens).not.toHaveBeenCalled();
    });

    it('PATCH /:id → 403, controller NOT reached', async () => {
      const res = await call(server, 'PATCH', '/api/admin/tenants/1', { roles: ['ADMIN'], body: { name: 'X' } });
      expect(res.status).toBe(403);
      expect(controllerStub.update).not.toHaveBeenCalled();
    });

    it('DELETE /:id → 403, controller NOT reached', async () => {
      const res = await call(server, 'DELETE', '/api/admin/tenants/1', { roles: ['ADMIN'] });
      expect(res.status).toBe(403);
      expect(controllerStub.remove).not.toHaveBeenCalled();
    });

    it('GET /audit → 403, controller NOT reached', async () => {
      const res = await call(server, 'GET', '/api/admin/tenants/audit', { roles: ['ADMIN'] });
      expect(res.status).toBe(403);
      expect(controllerStub.audit).not.toHaveBeenCalled();
    });
  });

  // ── SUPER_ADMIN → reaches controller ─────────────────────────────────────────

  describe('SUPER_ADMIN passes all gates and reaches controller', () => {
    it('GET / → 200, controller.list called', async () => {
      const res = await call(server, 'GET', '/api/admin/tenants', { roles: ['SUPER_ADMIN'] });
      expect(res.status).toBe(200);
      expect(controllerStub.list).toHaveBeenCalledOnce();
    });

    it('POST / → 201, controller.create called', async () => {
      const res = await call(server, 'POST', '/api/admin/tenants', {
        roles: ['SUPER_ADMIN'],
        body: { slug: 'new', name: 'New', adminUsername: 'u', adminPassword: 'p' },
      });
      expect(res.status).toBe(201);
      expect(controllerStub.create).toHaveBeenCalledOnce();
    });

    it('PATCH /:id/status → 200, controller.setStatus called', async () => {
      const res = await call(server, 'PATCH', '/api/admin/tenants/1/status', {
        roles: ['SUPER_ADMIN'],
        body: { status: 'ACTIVE' },
      });
      expect(res.status).toBe(200);
      expect(controllerStub.setStatus).toHaveBeenCalledOnce();
    });

    it('POST /:id/regenerate-tokens → 200, controller.regenerateTokens called', async () => {
      const res = await call(server, 'POST', '/api/admin/tenants/1/regenerate-tokens', {
        roles: ['SUPER_ADMIN'],
      });
      expect(res.status).toBe(200);
      expect(controllerStub.regenerateTokens).toHaveBeenCalledOnce();
    });

    it('PATCH /:id → 200, controller.update called', async () => {
      const res = await call(server, 'PATCH', '/api/admin/tenants/1', { roles: ['SUPER_ADMIN'], body: { name: 'X' } });
      expect(res.status).toBe(200);
      expect(controllerStub.update).toHaveBeenCalledOnce();
    });

    it('DELETE /:id → 200, controller.remove called', async () => {
      const res = await call(server, 'DELETE', '/api/admin/tenants/1', { roles: ['SUPER_ADMIN'] });
      expect(res.status).toBe(200);
      expect(controllerStub.remove).toHaveBeenCalledOnce();
    });

    it('GET /audit → 200, controller.audit called', async () => {
      const res = await call(server, 'GET', '/api/admin/tenants/audit', { roles: ['SUPER_ADMIN'] });
      expect(res.status).toBe(200);
      expect(controllerStub.audit).toHaveBeenCalledOnce();
    });
  });
});
