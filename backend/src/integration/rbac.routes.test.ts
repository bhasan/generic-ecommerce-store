import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../middleware/error.middleware';

// Proves the BACKEND enforces role boundaries — not just the frontend redirect that
// the Playwright RBAC smoke layer exercises. Only the JWT decode is mocked, so the
// real authenticate + authorize middleware run against forged role claims.

const verifyToken = vi.hoisted(() => vi.fn());
const extractTokenFromHeader = vi.hoisted(() =>
  vi.fn((header?: string) => (header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null)),
);
const logger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }));

// Service stubs so that *authorized* requests pass through the controller without
// touching a database. Forbidden/unauthenticated requests never reach these.
const storeCreditService = vi.hoisted(() => ({ addCredit: vi.fn().mockResolvedValue({ id: 1 }) }));
const userService = vi.hoisted(() => ({
  getAllUsers: vi.fn().mockResolvedValue([]),
  deleteUser: vi.fn().mockResolvedValue({ message: 'deleted' }),
}));
const orderService = vi.hoisted(() => ({
  deleteOrder: vi.fn().mockResolvedValue({ message: 'deleted' }),
  getReadyForDeliveryOrders: vi.fn().mockResolvedValue([]),
}));
const orderingConstraintsService = vi.hoisted(() => ({
  updateOrderingConstraints: vi.fn().mockResolvedValue({}),
  getOrderingConstraints: vi.fn().mockResolvedValue({}),
}));
const storeSettingsService = vi.hoisted(() => ({
  updateStoreSettings: vi.fn().mockResolvedValue({}),
  getStoreSettings: vi.fn().mockResolvedValue({}),
}));

vi.mock('../utils/jwt.util', () => ({ verifyToken, extractTokenFromHeader }));
vi.mock('../utils/logger', () => ({ logger }));
vi.mock('../services/store-credit.service', () => ({ default: storeCreditService }));
vi.mock('../services/user.service', () => ({ default: userService }));
vi.mock('../services/order.service', () => ({ default: orderService }));
vi.mock('../services/orderingConstraints.service', () => ({
  OrderingConstraintsService: vi.fn(() => orderingConstraintsService),
}));
vi.mock('../services/storeSettings.service', () => ({
  StoreSettingsService: vi.fn(() => storeSettingsService),
}));
// order.controller also instantiates DeliveryEligibilityService at import time.
vi.mock('../services/deliveryEligibility.service', () => ({
  DeliveryEligibilityService: vi.fn(() => ({ checkDeliveryEligibility: vi.fn() })),
}));

const createServer = async () => {
  const [
    { default: creditRoutes },
    { default: userRoutes },
    { default: orderRoutes },
    { default: orderingConstraintsRoutes },
    { default: storeSettingsRoutes },
  ] = await Promise.all([
    import('../routes/credit.routes'),
    import('../routes/user.routes'),
    import('../routes/order.routes'),
    import('../routes/orderingConstraints.routes'),
    import('../routes/storeSettings.routes'),
  ]);

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.requestId = 'req-rbac';
    next();
  });
  app.use('/api/storecredit', creditRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/orders', orderRoutes);
  app.use('/api/ordering-constraints', orderingConstraintsRoutes);
  app.use('/api/store-settings', storeSettingsRoutes);
  app.use(errorHandler);
  return app.listen(0);
};

type Server = Awaited<ReturnType<typeof createServer>>;

const call = async (
  server: Server,
  method: string,
  path: string,
  opts: { role?: string; body?: unknown } = {},
) => {
  const { port } = server.address() as AddressInfo;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.role) {
    verifyToken.mockReturnValue({ userId: 99, username: `${opts.role}-user`, roles: [opts.role] });
    headers.Authorization = 'Bearer forged-token';
  }
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  return response;
};

interface Case {
  label: string;
  method: string;
  path: string;
  validBody?: unknown;
  authorized: string; // a role that IS allowed
  forbidden: string[]; // roles that must be rejected with 403
}

// One row per protected endpoint, spanning the three guard tiers
// (authorizeManagement, authorizeAdmin, and the delivery-board allowlist).
const cases: Case[] = [
  {
    label: 'POST /api/storecredit/:id/add (management)',
    method: 'POST',
    path: '/api/storecredit/5/add',
    validBody: { amount: 10 },
    authorized: 'MANAGEMENT',
    forbidden: ['CUSTOMER', 'EMPLOYEE', 'DELIVERY_DRIVER'],
  },
  {
    label: 'GET /api/users (management)',
    method: 'GET',
    path: '/api/users',
    authorized: 'MANAGEMENT',
    forbidden: ['CUSTOMER', 'EMPLOYEE', 'DELIVERY_DRIVER'],
  },
  {
    label: 'DELETE /api/users/:id (admin)',
    method: 'DELETE',
    path: '/api/users/5',
    authorized: 'ADMIN',
    forbidden: ['MANAGEMENT', 'EMPLOYEE', 'CUSTOMER'],
  },
  {
    label: 'PUT /api/ordering-constraints (admin)',
    method: 'PUT',
    path: '/api/ordering-constraints',
    validBody: {},
    authorized: 'ADMIN',
    forbidden: ['MANAGEMENT', 'EMPLOYEE', 'CUSTOMER'],
  },
  {
    label: 'PUT /api/store-settings (admin)',
    method: 'PUT',
    path: '/api/store-settings',
    validBody: {},
    authorized: 'ADMIN',
    forbidden: ['MANAGEMENT', 'CUSTOMER'],
  },
  {
    label: 'DELETE /api/orders/:id (admin)',
    method: 'DELETE',
    path: '/api/orders/5',
    authorized: 'ADMIN',
    forbidden: ['MANAGEMENT', 'EMPLOYEE', 'CUSTOMER', 'DELIVERY_DRIVER'],
  },
  {
    label: 'GET /api/orders/ready-for-delivery (staff + driver)',
    method: 'GET',
    path: '/api/orders/ready-for-delivery',
    authorized: 'DELIVERY_DRIVER',
    forbidden: ['CUSTOMER'],
  },
];

describe('RBAC route enforcement (backend)', () => {
  let server: Server;

  beforeEach(async () => {
    vi.clearAllMocks();
    server = await createServer();
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  for (const c of cases) {
    describe(c.label, () => {
      it('rejects an unauthenticated request with 401', async () => {
        const res = await call(server, c.method, c.path, { body: c.validBody });
        expect(res.status).toBe(401);
      });

      for (const role of c.forbidden) {
        it(`rejects ${role} with 403`, async () => {
          const res = await call(server, c.method, c.path, { role, body: c.validBody });
          expect(res.status).toBe(403);
          const body = await res.json();
          expect(body.error).toMatch(/insufficient permissions/i);
        });
      }

      it(`allows ${c.authorized} through the role gate`, async () => {
        const res = await call(server, c.method, c.path, { role: c.authorized, body: c.validBody });
        // The role gate must pass — i.e. not a 401/403. Downstream may still 2xx.
        expect(res.status).not.toBe(401);
        expect(res.status).not.toBe(403);
      });
    });
  }
});
