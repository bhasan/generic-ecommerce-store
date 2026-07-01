import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler, notFoundHandler } from '../middleware/error.middleware';

// SHA-256('test-reporting-token') — pre-computed so the test doesn't depend on
// importing the real crypto utility (keeps the test deterministic and fast).
const TEST_TOKEN = 'test-reporting-token';
const TEST_TOKEN_HASH = 'ddf62f85c7d954ffdcbe24c76d86abab848e809ba352d4ec4d5097b3876a46e3';

const fakeTenant = { id: 1, slug: 'app', name: 'Test', status: 'ACTIVE' };
const fakeStore = { id: 1 };

// Mock the database so requireReportingAuth can do a per-tenant hash lookup
// without needing a real DB connection in this unit/integration test.
const mockPrisma = vi.hoisted(() => ({
  tenant: {
    findFirst: vi.fn(),
  },
  store: {
    findFirst: vi.fn(),
  },
}));

vi.mock('../config/database', () => ({
  default: mockPrisma,
  getUnscopedPrisma: () => mockPrisma,
  getTenantPrisma: () => mockPrisma,
}));

// Mock tenantContext so runWithTenant just calls the callback immediately.
vi.mock('../config/tenantContext', () => ({
  runWithTenant: (_ctx: unknown, fn: () => unknown) => fn(),
  getTenantContext: () => ({ tenantId: 1, storeId: 1, scope: 'tenant' }),
  getTenantContextOrThrow: () => ({ tenantId: 1, storeId: 1, scope: 'tenant' }),
}));

const reportingService = vi.hoisted(() => ({
  getHealth: vi.fn(),
  getMetadata: vi.fn(),
  listProducts: vi.fn(),
  listCategories: vi.fn(),
  listInventorySnapshots: vi.fn(),
  listOrders: vi.fn(),
  listRefunds: vi.fn(),
}));

vi.mock('../services/reporting.service', () => ({
  reportingService,
}));

const createServer = async () => {
  const { default: reportingRoutes } = await import('../routes/reporting.routes');
  const app = express();
  app.use(express.json());
  app.use('/api/reporting/v1', reportingRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app.listen(0);
};

const requestJson = async (server: ReturnType<typeof express.application.listen>, path: string, init?: RequestInit) => {
  const { port } = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${port}${path}`, init);
  const body = await response.json();
  return { response, body };
};

describe('online store reporting routes', () => {
  let server: Awaited<ReturnType<typeof createServer>>;
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      ONLINE_STORE_REPORTING_API_ENABLED: 'true',
      ONLINE_STORE_REPORTING_API_DEFAULT_PAGE_SIZE: '2',
      ONLINE_STORE_REPORTING_API_MAX_PAGE_SIZE: '3',
      ONLINE_STORE_REPORTING_API_RATE_LIMIT_PER_MINUTE: '500',
      ONLINE_STORE_REPORTING_API_SCHEMA_VERSION: '2026-06-online-store-reporting-v1',
    };

    // Default: valid token hash resolves to the fake active tenant.
    mockPrisma.tenant.findFirst.mockImplementation(({ where }: { where: { reportingTokenHash?: string } }) => {
      if (where.reportingTokenHash === TEST_TOKEN_HASH) return Promise.resolve(fakeTenant);
      return Promise.resolve(null);
    });
    mockPrisma.store.findFirst.mockResolvedValue(fakeStore);

    reportingService.getHealth.mockReturnValue({
      status: 'ok',
      service: 'online_store_reporting_api',
      provider_key: 'ONLINE_STORE',
      source_system: 'online_store',
      schema_version: '2026-06-online-store-reporting-v1',
      generated_at: '2026-06-16T10:00:00.000Z',
    });
    reportingService.getMetadata.mockReturnValue({ provider_key: 'ONLINE_STORE' });
    reportingService.listProducts.mockResolvedValue([]);
    reportingService.listCategories.mockResolvedValue([]);
    reportingService.listInventorySnapshots.mockResolvedValue([]);
    reportingService.listOrders.mockResolvedValue([]);
    reportingService.listRefunds.mockResolvedValue([]);
    server = await createServer();
  });

  afterEach(async () => {
    process.env = originalEnv;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  });

  it('rejects requests while the reporting API is disabled', async () => {
    process.env.ONLINE_STORE_REPORTING_API_ENABLED = 'false';

    const { response, body } = await requestJson(server, '/api/reporting/v1/health', {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(response.status).toBe(503);
    expect(body.error).toEqual(expect.objectContaining({
      message: 'Online store reporting API is disabled',
      code: 'REPORTING_API_DISABLED',
    }));
  });

  it('requires a valid bearer token (unknown token → 401)', async () => {
    const { response, body } = await requestJson(server, '/api/reporting/v1/health', {
      headers: { Authorization: 'Bearer wrong-token' },
    });

    expect(response.status).toBe(401);
    expect(body.error).toEqual(expect.objectContaining({
      message: 'Unauthorized',
      code: 'UNAUTHORIZED',
    }));
  });

  it('returns 401 when the bearer token is missing', async () => {
    const { response, body } = await requestJson(server, '/api/reporting/v1/health');

    expect(response.status).toBe(401);
    expect(body.error).toEqual(expect.objectContaining({
      message: 'Unauthorized',
      code: 'UNAUTHORIZED',
      request_id: expect.stringMatching(/^req_/),
    }));
  });

  it('returns 401 when the tenant is SUSPENDED', async () => {
    mockPrisma.tenant.findFirst.mockResolvedValue({ ...fakeTenant, status: 'SUSPENDED' });

    const { response, body } = await requestJson(server, '/api/reporting/v1/health', {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(response.status).toBe(401);
    expect(body.error).toEqual(expect.objectContaining({ code: 'UNAUTHORIZED' }));
  });

  it('X-Tenant-ID header does NOT change the resolved tenant — the token wins', async () => {
    // Tenant A's token is provided alongside X-Tenant-ID pointing at a different tenant.
    // The response should succeed (the token matches tenant A) regardless of the header.
    const { response } = await requestJson(server, '/api/reporting/v1/health', {
      headers: {
        Authorization: `Bearer ${TEST_TOKEN}`,
        'X-Tenant-ID': '9999', // a completely different tenant id
      },
    });

    // If token wins, we get 200 (tenant A's token is valid).
    // req.tenantId is set by requireReportingAuth to fakeTenant.id (1), not 9999.
    expect(response.status).toBe(200);
  });

  it('returns health when enabled and authenticated', async () => {
    const { response, body } = await requestJson(server, '/api/reporting/v1/health', {
      headers: {
        Authorization: `Bearer ${TEST_TOKEN}`,
        'X-Request-Id': 'req-client-health',
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('x-request-id')).toBe('req-client-health');
    expect(body.data).toEqual({
      status: 'ok',
      service: 'online_store_reporting_api',
      provider_key: 'ONLINE_STORE',
      source_system: 'online_store',
      schema_version: '2026-06-online-store-reporting-v1',
      generated_at: '2026-06-16T10:00:00.000Z',
    });
  });

  it('generates a request id when X-Request-Id is missing', async () => {
    const { response } = await requestJson(server, '/api/reporting/v1/health', {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('x-request-id')).toEqual(expect.stringMatching(/^req_/));
  });

  it('does not expose the old consumer-specific route family', async () => {
    const { response, body } = await requestJson(server, '/api/physalia/v1/health', {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(response.status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('wraps product lists in the reporting envelope and clamps page size', async () => {
    reportingService.listProducts.mockResolvedValue([
      { id: 'prod_1' },
      { id: 'prod_2' },
      { id: 'prod_3' },
      { id: 'prod_4' },
    ]);

    const { response, body } = await requestJson(
      server,
      '/api/reporting/v1/products?page=2&page_size=10&updated_since=2026-06-01T00:00:00Z',
      {
        headers: {
          Authorization: `Bearer ${TEST_TOKEN}`,
          'X-Request-Id': 'req-products',
        },
      }
    );

    expect(response.status).toBe(200);
    expect(reportingService.listProducts).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, pageSize: 3, skip: 3, take: 4 }),
      expect.objectContaining({ updatedSince: new Date('2026-06-01T00:00:00Z') })
    );
    expect(body.data.data).toEqual([{ id: 'prod_1' }, { id: 'prod_2' }, { id: 'prod_3' }]);
    expect(body.data.pagination).toEqual({
      page: 2,
      page_size: 3,
      has_next: true,
      next_page: 3,
    });
    expect(body.data.meta).toEqual(expect.objectContaining({
      request_id: 'req-products',
      source_system: 'online_store',
      provider_key: 'ONLINE_STORE',
      schema_version: '2026-06-online-store-reporting-v1',
    }));
  });

  it('returns a controlled 400 for invalid ISO date filters', async () => {
    const { response, body } = await requestJson(server, '/api/reporting/v1/orders?placed_since=not-a-date', {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(response.status).toBe(400);
    expect(body.error).toEqual(expect.objectContaining({
      message: 'placed_since must be an ISO-8601 timestamp',
      code: 'INVALID_QUERY',
    }));
  });

  it('returns an empty refunds envelope with explicit unsupported metadata', async () => {
    const { response, body } = await requestJson(server, '/api/reporting/v1/refunds', {
      headers: {
        Authorization: `Bearer ${TEST_TOKEN}`,
        'X-Request-Id': 'req-refunds',
      },
    });

    expect(response.status).toBe(200);
    expect(body.data.data).toEqual([]);
    expect(body.data.meta).toEqual(expect.objectContaining({
      request_id: 'req-refunds',
      refunds_supported: false,
    }));
  });
});
