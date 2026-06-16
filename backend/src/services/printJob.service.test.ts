import { describe, it, expect, beforeEach, vi } from 'vitest';

const prismaMock = {
  printJob: {
    create: vi.fn(),
    updateMany: vi.fn(),
    findUnique: vi.fn(),
  },
  $queryRaw: vi.fn(),
};

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

vi.mock('../config/database', () => ({
  default: prismaMock,
}));

vi.mock('../utils/logger', () => ({
  logger,
}));

describe('print job service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates pending print jobs with the full receipt payload unchanged', async () => {
    const payload = {
      eventType: 'ORDER_RECEIPT_PRINT_REQUESTED',
      source: 'smoke-station-delivery',
      requestedAt: '2026-04-20T12:00:00.000Z',
      reason: 'ORDER_CREATED',
      actor: { userId: 7, username: null },
      printer: { storeName: 'Smoke Station', format: 'text/plain', width: 42 },
      order: { id: 88 },
      receipt: { templateType: 'STAFF_TICKET', text: 'ORDER #88', lineCount: 1 },
    };
    prismaMock.printJob.create.mockResolvedValue({
      id: 501,
      orderId: 88,
      reason: 'ORDER_CREATED',
      status: 'PENDING',
      payloadJson: payload,
    });

    const { printJobService } = await import('./printJob.service');
    const job = await printJobService.createPrintJob({
      orderId: 88,
      reason: 'ORDER_CREATED',
      payload,
    });

    expect(prismaMock.printJob.create).toHaveBeenCalledWith({
      data: {
        orderId: 88,
        reason: 'ORDER_CREATED',
        status: 'PENDING',
        payloadJson: payload,
      },
    });
    expect(job.payloadJson).toBe(payload);
  });

  it('claims the oldest eligible job with atomic SQL and stale-claim recovery', async () => {
    const claimedAt = new Date('2026-04-20T12:00:00.000Z');
    prismaMock.$queryRaw.mockResolvedValue([
      {
        id: 501,
        orderId: 88,
        reason: 'ORDER_CREATED',
        status: 'CLAIMED',
        payloadJson: { receipt: { text: 'ORDER #88' } },
        createdAt: new Date('2026-04-20T11:59:00.000Z'),
        claimedAt: claimedAt,
        completedAt: null,
        failedAt: null,
        claimedByAgentId: 'pos-01',
        nativeJobId: null,
        attemptCount: 0,
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    ]);

    const { printJobService } = await import('./printJob.service');
    const job = await printJobService.claimNextJob({ agentId: 'pos-01' });
    const sqlText = String(prismaMock.$queryRaw.mock.calls[0][0]);

    expect(sqlText).toContain('FOR UPDATE SKIP LOCKED');
    expect(sqlText).toContain('ORDER BY "createdAt" ASC');
    expect(sqlText).toContain('"status" = \'PENDING\'::"PrintJobStatus"');
    expect(sqlText).toContain('"status" = \'CLAIMED\'::"PrintJobStatus"');
    expect(sqlText).toContain('"claimedAt" < NOW() - INTERVAL \'5 minutes\'');
    expect(job).toMatchObject({
      id: 501,
      orderId: 88,
      reason: 'ORDER_CREATED',
      status: 'CLAIMED',
      claimedAt,
      claimedByAgentId: 'pos-01',
      nativeJobId: null,
    });
  });

  it('returns null when no jobs are claimable', async () => {
    prismaMock.$queryRaw.mockResolvedValue([]);

    const { printJobService } = await import('./printJob.service');
    const job = await printJobService.claimNextJob({ agentId: 'pos-01' });

    expect(job).toBeNull();
  });

  it('marks only this agent claimed jobs as printed and persists native job id when provided', async () => {
    const printedJob = { id: 501, status: 'PRINTED', completedAt: new Date(), nativeJobId: 'win-123' };
    prismaMock.printJob.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.printJob.findUnique.mockResolvedValue(printedJob);

    const { printJobService } = await import('./printJob.service');
    const job = await printJobService.markSuccess(501, { agentId: 'pos-01', nativeJobId: 'win-123' });

    expect(prismaMock.printJob.updateMany).toHaveBeenCalledWith({
      where: {
        id: 501,
        status: 'CLAIMED',
        claimedByAgentId: 'pos-01',
      },
      data: {
        status: 'PRINTED',
        completedAt: expect.any(Date),
        failedAt: null,
        nativeJobId: 'win-123',
      },
    });
    expect(job).toBe(printedJob);
  });

  it('keeps native job id optional on success acknowledgements', async () => {
    const printedJob = { id: 501, status: 'PRINTED', completedAt: new Date(), nativeJobId: null };
    prismaMock.printJob.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.printJob.findUnique.mockResolvedValue(printedJob);

    const { printJobService } = await import('./printJob.service');
    const job = await printJobService.markSuccess(501, { agentId: 'pos-01' });

    expect(prismaMock.printJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        nativeJobId: null,
      }),
    }));
    expect(job).toBe(printedJob);
  });

  it('marks only this agent claimed jobs as failed and increments attempt count', async () => {
    const failedJob = { id: 501, status: 'FAILED', attemptCount: 1 };
    prismaMock.printJob.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.printJob.findUnique.mockResolvedValue(failedJob);

    const { printJobService } = await import('./printJob.service');
    const job = await printJobService.markFailure(501, {
      agentId: 'pos-01',
      errorCode: 'PRINTER_OFFLINE',
      errorMessage: 'Printer offline',
    });

    expect(prismaMock.printJob.updateMany).toHaveBeenCalledWith({
      where: {
        id: 501,
        status: 'CLAIMED',
        claimedByAgentId: 'pos-01',
      },
      data: {
        status: 'FAILED',
        failedAt: expect.any(Date),
        attemptCount: { increment: 1 },
        lastErrorCode: 'PRINTER_OFFLINE',
        lastErrorMessage: 'Printer offline',
      },
    });
    expect(job).toBe(failedJob);
  });

  it('rejects invalid success and failure transitions cleanly', async () => {
    prismaMock.printJob.updateMany.mockResolvedValue({ count: 0 });

    const { printJobService } = await import('./printJob.service');

    await expect(printJobService.markSuccess(501, { agentId: 'pos-01' })).rejects.toMatchObject({
      statusCode: 404,
      code: 'PRINT_JOB_NOT_FOUND',
    });
    await expect(printJobService.markFailure(501, {
      agentId: 'pos-01',
      errorCode: 'PRINTER_OFFLINE',
      errorMessage: 'Printer offline',
    })).rejects.toMatchObject({
      statusCode: 404,
      code: 'PRINT_JOB_NOT_FOUND',
    });
  });
});
