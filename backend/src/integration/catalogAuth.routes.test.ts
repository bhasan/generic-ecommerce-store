// backend/src/integration/catalogAuth.routes.test.ts
//
// Guards against accidental un-gating of the catalog and config endpoints.
// This session gated /api/products, /api/categories, and /api/config behind
// `authenticate` (login-gated store). These routes previously leaked catalog
// data without authentication; only E2E currently exercises this gate end-to-end.
//
// The app is built to mirror index.ts exactly:
//   app.use('/api/products',   generalLimiter, authenticate, productRoutes)
//   app.use('/api/categories', generalLimiter, authenticate, categoryRoutes)
//   app.get('/api/config',     authenticate, <handler>)
// (generalLimiter is omitted in tests; authenticate is the critical gate.)
//
// Primary regression value: no token → 401 on every guarded endpoint.
// Secondary value: valid token → auth gate passes (status is not 401).

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

// Controller stubs — authorized requests pass through cleanly without hitting
// real services or the database. The regression value is the 401 on no-token,
// not the 200 payload, but clean stubs avoid noisy 500s in the valid-token path.
const productControllerStub = vi.hoisted(() => ({
  getAllProducts: vi.fn((_req: any, res: any) => res.status(200).json({ data: [] })),
  searchProducts: vi.fn((_req: any, res: any) => res.status(200).json({ data: [] })),
  getProductById: vi.fn((_req: any, res: any) => res.status(200).json({ data: {} })),
  exportZip: vi.fn((_req: any, res: any) => res.status(200).json({})),
  createProduct: vi.fn((_req: any, res: any) => res.status(201).json({ data: {} })),
  updateProduct: vi.fn((_req: any, res: any) => res.status(200).json({ data: {} })),
  deleteProduct: vi.fn((_req: any, res: any) => res.status(200).json({})),
}));

const categoryControllerStub = vi.hoisted(() => ({
  getAllCategories: vi.fn((_req: any, res: any) => res.status(200).json({ data: [] })),
  createCategory: vi.fn((_req: any, res: any) => res.status(201).json({ data: {} })),
  updateCategory: vi.fn((_req: any, res: any) => res.status(200).json({ data: {} })),
  deleteCategory: vi.fn((_req: any, res: any) => res.status(200).json({})),
}));

vi.mock('../utils/jwt.util', () => ({ verifyToken, extractTokenFromHeader }));
vi.mock('../utils/logger', () => ({ logger }));
vi.mock('../controllers/product.controller', () => ({ default: productControllerStub }));
vi.mock('../controllers/category.controller', () => ({ default: categoryControllerStub }));

const createServer = async () => {
  const [
    { authenticate },
    { default: productRoutes },
    { default: categoryRoutes },
  ] = await Promise.all([
    import('../middleware/auth.middleware'),
    import('../routes/product.routes'),
    import('../routes/category.routes'),
  ]);

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.requestId = 'req-catalog-auth';
    next();
  });

  // Mirrors index.ts mounting (generalLimiter omitted):
  app.use('/api/products', authenticate, productRoutes);
  app.use('/api/categories', authenticate, categoryRoutes);
  // /api/config is an inline route in index.ts — use a stub handler here since
  // the real handler calls multiple services (payment, store-settings, etc.).
  // The auth gate is what matters, not the response body.
  app.get('/api/config', authenticate, (_req, res) => res.status(200).json({ ok: true }));

  app.use(errorHandler);
  return app.listen(0);
};

type Server = Awaited<ReturnType<typeof createServer>>;

const get = async (server: Server, path: string, token?: string) => {
  const { port } = server.address() as AddressInfo;
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return fetch(`http://127.0.0.1:${port}${path}`, { headers });
};

describe('catalog + config auth gating (login-gated store)', () => {
  let server: Server;

  beforeEach(async () => {
    vi.clearAllMocks();
    setDefaultTenantId(1);
    // Configure verifyToken so any Bearer token yields a valid user (all roles).
    verifyToken.mockReturnValue({ userId: 9, username: 'test-user', roles: ['CUSTOMER'], tenantId: 1 });
    server = await createServer();
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  // ── Primary regression: no token → 401 ───────────────────────────────────────

  describe('no token → 401 (catalog must never be publicly accessible)', () => {
    it('GET /api/products → 401', async () => {
      const res = await get(server, '/api/products');
      expect(res.status).toBe(401);
    });

    it('GET /api/categories → 401', async () => {
      const res = await get(server, '/api/categories');
      expect(res.status).toBe(401);
    });

    it('GET /api/config → 401', async () => {
      const res = await get(server, '/api/config');
      expect(res.status).toBe(401);
    });
  });

  // ── Secondary: valid token passes the auth gate ───────────────────────────────

  describe('valid token → auth gate passes (status is not 401)', () => {
    it('GET /api/products with token → not 401', async () => {
      const res = await get(server, '/api/products', 'valid-token');
      expect(res.status).not.toBe(401);
    });

    it('GET /api/categories with token → not 401', async () => {
      const res = await get(server, '/api/categories', 'valid-token');
      expect(res.status).not.toBe(401);
    });

    it('GET /api/config with token → not 401', async () => {
      const res = await get(server, '/api/config', 'valid-token');
      expect(res.status).not.toBe(401);
    });
  });
});
