import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import printJobRoutes from '../routes/printJob.routes';
import { errorHandler } from '../middleware/error.middleware';

// SHA-256('agent-secret') — pre-computed so the test doesn't depend on
// importing the real crypto utility (keeps the test deterministic and fast).
const TEST_KEY = 'agent-secret';
const TEST_KEY_HASH = 'cc000e626ba67bed4834794d42288b228f012823877440d2bc5a3787cc6ffce9';

const fakeTenant = { id: 1, slug: 'app', name: 'Test', status: 'ACTIVE' };
const fakeStore = { id: 1 };

// Mock the database so authenticatePrintAgent can do a per-tenant hash lookup
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

const printJobService = vi.hoisted(() => ({
  claimNextJob: vi.fn(),
  markSuccess: vi.fn(),
  markFailure: vi.fn(),
}));

vi.mock('../services/printJob.service', () => ({
  printJobService,
}));

const createServer = () => {
  const app = express();
  app.use((req, _res, next) => {
    req.requestId = 'req-print-jobs';
    next();
  });
  app.use(express.json());
  app.use('/api/print-jobs', printJobRoutes);
  app.use(errorHandler);
  return app.listen(0);
};

const requestJson = async (server: ReturnType<typeof express.application.listen>, path: string, init?: RequestInit) => {
  const { port } = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${port}${path}`, init);
  const body = await response.json();
  return { response, body };
};

describe('print job routes', () => {
  let server: ReturnType<typeof createServer>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Default: valid key hash resolves to the fake active tenant.
    mockPrisma.tenant.findFirst.mockImplementation(({ where }: { where: { printAgentKeyHash?: string } }) => {
      if (where.printAgentKeyHash === TEST_KEY_HASH) return Promise.resolve(fakeTenant);
      return Promise.resolve(null);
    });
    mockPrisma.store.findFirst.mockResolvedValue(fakeStore);

    server = createServer();
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  });

  it('claims the next available print job for an authenticated agent', async () => {
    const job = {
      id: 1,
      orderId: 81,
      reason: 'ORDER_CREATED',
      status: 'CLAIMED',
      payloadJson: {
        receipt: {
          text: 'receipt body',
        },
      },
    };
    printJobService.claimNextJob.mockResolvedValue(job);

    const { response, body } = await requestJson(server, '/api/print-jobs/claim', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-print-agent-key': TEST_KEY,
      },
      body: JSON.stringify({ agentId: 'pos-01' }),
    });

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, data: { job } });
    expect(printJobService.claimNextJob).toHaveBeenCalledWith({ agentId: 'pos-01' });
  });

  it('returns null when no print job is available', async () => {
    printJobService.claimNextJob.mockResolvedValue(null);

    const { response, body } = await requestJson(server, '/api/print-jobs/claim', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-print-agent-key': TEST_KEY,
      },
      body: JSON.stringify({ agentId: 'pos-01' }),
    });

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, data: { job: null } });
  });

  it('marks a claimed print job as successful', async () => {
    const job = { id: 1, status: 'PRINTED', completedAt: '2026-04-20T12:00:00.000Z', nativeJobId: 'win-123' };
    printJobService.markSuccess.mockResolvedValue(job);

    const { response, body } = await requestJson(server, '/api/print-jobs/1/success', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-print-agent-key': TEST_KEY,
      },
      body: JSON.stringify({ agentId: 'pos-01', nativeJobId: 'win-123' }),
    });

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, data: { job } });
    expect(printJobService.markSuccess).toHaveBeenCalledWith(1, {
      agentId: 'pos-01',
      nativeJobId: 'win-123',
    });
  });

  it('marks a claimed print job as failed', async () => {
    const job = {
      id: 1,
      status: 'FAILED',
      attemptCount: 1,
      lastErrorCode: 'PRINTER_OFFLINE',
      lastErrorMessage: 'Printer offline',
    };
    printJobService.markFailure.mockResolvedValue(job);

    const { response, body } = await requestJson(server, '/api/print-jobs/1/failure', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-print-agent-key': TEST_KEY,
      },
      body: JSON.stringify({
        agentId: 'pos-01',
        errorCode: 'PRINTER_OFFLINE',
        errorMessage: 'Printer offline',
      }),
    });

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, data: { job } });
    expect(printJobService.markFailure).toHaveBeenCalledWith(1, {
      agentId: 'pos-01',
      errorCode: 'PRINTER_OFFLINE',
      errorMessage: 'Printer offline',
    });
  });

  it('rejects requests with a missing or invalid print agent key', async () => {
    const { response, body } = await requestJson(server, '/api/print-jobs/claim', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-print-agent-key': 'wrong',
      },
      body: JSON.stringify({ agentId: 'pos-01' }),
    });

    expect(response.status).toBe(401);
    expect(body).toEqual({
      error: {
        message: 'Invalid print agent key',
        code: 'INVALID_PRINT_AGENT_KEY',
        requestId: 'req-print-jobs',
      },
    });
    expect(printJobService.claimNextJob).not.toHaveBeenCalled();
  });

  it('rejects requests with no print agent key header', async () => {
    const { response, body } = await requestJson(server, '/api/print-jobs/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: 'pos-01' }),
    });

    expect(response.status).toBe(401);
    expect(body.error.code).toBe('INVALID_PRINT_AGENT_KEY');
    expect(printJobService.claimNextJob).not.toHaveBeenCalled();
  });

  it('rejects requests when the tenant is SUSPENDED', async () => {
    mockPrisma.tenant.findFirst.mockResolvedValue({ ...fakeTenant, status: 'SUSPENDED' });

    const { response, body } = await requestJson(server, '/api/print-jobs/claim', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-print-agent-key': TEST_KEY,
      },
      body: JSON.stringify({ agentId: 'pos-01' }),
    });

    expect(response.status).toBe(401);
    expect(body.error.code).toBe('INVALID_PRINT_AGENT_KEY');
  });

  it('X-Tenant-ID header does NOT change the resolved tenant — the key wins', async () => {
    // Tenant A's key is provided alongside X-Tenant-ID pointing at a different tenant.
    // Auth should succeed (key matches tenant A) regardless of the header.
    printJobService.claimNextJob.mockResolvedValue(null);

    const { response } = await requestJson(server, '/api/print-jobs/claim', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-print-agent-key': TEST_KEY,
        'X-Tenant-ID': '9999', // completely different tenant id — must be ignored
      },
      body: JSON.stringify({ agentId: 'pos-01' }),
    });

    // Key matches tenant 1 → auth passes, returns 200 regardless of the header.
    expect(response.status).toBe(200);
  });
});
