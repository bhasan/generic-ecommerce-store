import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import printJobRoutes from '../routes/printJob.routes';
import { errorHandler } from '../middleware/error.middleware';

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
  const originalKey = process.env.PRINT_AGENT_SHARED_KEY;
  let server: ReturnType<typeof createServer>;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PRINT_AGENT_SHARED_KEY = 'agent-secret';
    server = createServer();
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    process.env.PRINT_AGENT_SHARED_KEY = originalKey;
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
        'x-print-agent-key': 'agent-secret',
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
        'x-print-agent-key': 'agent-secret',
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
        'x-print-agent-key': 'agent-secret',
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
        'x-print-agent-key': 'agent-secret',
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
});
