import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/database', () => ({ default: {
  $queryRaw: vi.fn(),
  posOutbox: { update: vi.fn() },
} }));
vi.mock('./posOrderService', () => ({
  processOutboxRow: vi.fn(),
  countPending: vi.fn().mockResolvedValue(0),
  DeferralError: class DeferralError extends Error { constructor(m: string) { super(m); this.name = 'DeferralError'; } },
}));
vi.mock('../../../utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import prisma from '../../../config/database';
import { processOutboxRow, DeferralError } from './posOrderService';
import { runOutboxOnce } from './outboxWorker';
import { logger } from '../../../utils/logger';

beforeEach(() => vi.clearAllMocks());

describe('runOutboxOnce', () => {
  it('marks a row DONE on success', async () => {
    (prisma as any).$queryRaw.mockResolvedValue([{ id: 1, orderId: 5, provider: 'foreverpos', type: 'ORDER_CREATED', attempts: 0 }]);
    (processOutboxRow as any).mockResolvedValue(undefined);
    await runOutboxOnce();
    expect((prisma as any).posOutbox.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { status: 'DONE' } });
  });

  it('increments attempts and stays PENDING on failure below cap', async () => {
    (prisma as any).$queryRaw.mockResolvedValue([{ id: 2, orderId: 5, provider: 'foreverpos', type: 'ORDER_CREATED', attempts: 1 }]);
    (processOutboxRow as any).mockRejectedValue(new Error('boom'));
    await runOutboxOnce();
    expect((prisma as any).posOutbox.update).toHaveBeenCalledWith({ where: { id: 2 }, data: { status: 'PENDING', attempts: 2, lastError: expect.stringContaining('boom') } });
    expect(logger.warn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ event: 'pos_outbox_retry' }));
  });

  it('marks FAILED at the attempts cap', async () => {
    (prisma as any).$queryRaw.mockResolvedValue([{ id: 3, orderId: 5, provider: 'foreverpos', type: 'ORDER_CREATED', attempts: 4 }]);
    (processOutboxRow as any).mockRejectedValue(new Error('boom'));
    await runOutboxOnce();
    expect((prisma as any).posOutbox.update).toHaveBeenCalledWith({ where: { id: 3 }, data: { status: 'FAILED', attempts: 5, lastError: expect.stringContaining('boom') } });
    expect(logger.error).toHaveBeenCalledWith(expect.any(String), expect.anything(), expect.objectContaining({ event: 'pos_outbox_failed' }));
  });

  it('defers ORDER_UPDATED without consuming an attempt', async () => {
    (prisma as any).$queryRaw.mockResolvedValue([{ id: 4, orderId: 5, provider: 'foreverpos', type: 'ORDER_UPDATED', attempts: 0 }]);
    (processOutboxRow as any).mockRejectedValue(new DeferralError('no mapping yet for order 5'));
    await runOutboxOnce();
    expect((prisma as any).posOutbox.update).not.toHaveBeenCalled();
  });
});
