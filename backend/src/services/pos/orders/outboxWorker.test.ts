import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  $transaction: vi.fn(),
  posOutbox: { update: vi.fn(), updateMany: vi.fn(), count: vi.fn().mockResolvedValue(0) },
}));
// The worker uses the UNSCOPED client for cross-tenant bookkeeping; mock both exports to it.
vi.mock('../../../config/database', () => ({ default: mockPrisma, getUnscopedPrisma: () => mockPrisma }));
vi.mock('./posOrderService', () => ({
  processOutboxRow: vi.fn(),
  DeferralError: class DeferralError extends Error { constructor(m: string) { super(m); this.name = 'DeferralError'; } },
}));
const getStoreSettings = vi.hoisted(() => vi.fn());
vi.mock('../../storeSettings.service', () => ({ StoreSettingsService: vi.fn(() => ({ getStoreSettings })) }));
vi.mock('../registry', () => ({ getOrderSync: vi.fn(() => ({ shouldPushStatus: vi.fn(), pushOrder: vi.fn(), pushStatus: vi.fn() })) }));
vi.mock('../../../utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { processOutboxRow as runProcessOutboxRow, DeferralError } from './posOrderService';
import { runOutboxOnce } from './outboxWorker';
import { getOrderSync } from '../registry';
import { getTenantContext } from '../../../config/tenantContext';
import { logger } from '../../../utils/logger';

const POS = { posProvider: 'foreverpos', posConfig: { baseUrl: 'x', username: 'u', password: 'p', sakCatchAllProductId: 1, sakCatchAllVariantId: 2 } };

beforeEach(() => {
  vi.clearAllMocks();
  getStoreSettings.mockResolvedValue(POS);
  (getOrderSync as any).mockReturnValue({ shouldPushStatus: vi.fn(), pushOrder: vi.fn(), pushStatus: vi.fn() });
  mockPrisma.posOutbox.count.mockResolvedValue(0);
  // $transaction executes the callback with the same mock client so $queryRaw is intercepted.
  mockPrisma.$transaction.mockImplementation((fn: (tx: typeof mockPrisma) => unknown) => fn(mockPrisma));
});

describe('runOutboxOnce', () => {
  it('marks a row DONE on success', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ id: 1, orderId: 5, provider: 'foreverpos', type: 'ORDER_CREATED', attempts: 0, tenantId: 11, storeId: 1 }]);
    (runProcessOutboxRow as any).mockResolvedValue(undefined);
    await runOutboxOnce();
    expect(mockPrisma.posOutbox.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { status: 'DONE' } });
  });

  it('resolves the POS provider PER ROW inside that row tenant context (not once globally)', async () => {
    const seenTenants: number[] = [];
    getStoreSettings.mockImplementation(async () => {
      seenTenants.push(getTenantContext()!.tenantId);
      return POS;
    });
    mockPrisma.$queryRaw.mockResolvedValue([
      { id: 1, orderId: 5, provider: 'foreverpos', type: 'ORDER_CREATED', attempts: 0, tenantId: 11, storeId: 1 },
      { id: 2, orderId: 6, provider: 'foreverpos', type: 'ORDER_CREATED', attempts: 0, tenantId: 22, storeId: 2 },
    ]);
    (runProcessOutboxRow as any).mockResolvedValue(undefined);
    await runOutboxOnce();
    // Settings (→ provider/credentials) resolved once per row, each in its own tenant context.
    expect(seenTenants).toEqual([11, 22]);
    expect(getOrderSync).toHaveBeenCalledTimes(2);
  });

  it('marks DONE (not synced) when the row tenant has no POS configured', async () => {
    (getOrderSync as any).mockReturnValue(null); // POS not configured for this tenant
    mockPrisma.$queryRaw.mockResolvedValue([{ id: 9, orderId: 5, provider: 'foreverpos', type: 'ORDER_CREATED', attempts: 0, tenantId: 11, storeId: 1 }]);
    await runOutboxOnce();
    expect(mockPrisma.posOutbox.update).toHaveBeenCalledWith({ where: { id: 9 }, data: { status: 'DONE', lastError: 'POS not configured for tenant' } });
    expect(runProcessOutboxRow).not.toHaveBeenCalled();
  });

  it('increments attempts and stays PENDING on failure below cap', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ id: 2, orderId: 5, provider: 'foreverpos', type: 'ORDER_CREATED', attempts: 1, tenantId: 11, storeId: 1 }]);
    (runProcessOutboxRow as any).mockRejectedValue(new Error('boom'));
    await runOutboxOnce();
    expect(mockPrisma.posOutbox.update).toHaveBeenCalledWith({ where: { id: 2 }, data: { status: 'PENDING', attempts: 2, lastError: expect.stringContaining('boom') } });
    expect(logger.warn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ event: 'pos_outbox_retry' }));
  });

  it('marks FAILED at the attempts cap', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ id: 3, orderId: 5, provider: 'foreverpos', type: 'ORDER_CREATED', attempts: 4, tenantId: 11, storeId: 1 }]);
    (runProcessOutboxRow as any).mockRejectedValue(new Error('boom'));
    await runOutboxOnce();
    expect(mockPrisma.posOutbox.update).toHaveBeenCalledWith({ where: { id: 3 }, data: { status: 'FAILED', attempts: 5, lastError: expect.stringContaining('boom') } });
    expect(logger.error).toHaveBeenCalledWith(expect.any(String), expect.anything(), expect.objectContaining({ event: 'pos_outbox_failed' }));
  });

  it('defers ORDER_UPDATED without consuming an attempt', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ id: 4, orderId: 5, provider: 'foreverpos', type: 'ORDER_UPDATED', attempts: 0, tenantId: 11, storeId: 1 }]);
    (runProcessOutboxRow as any).mockRejectedValue(new DeferralError('no mapping yet for order 5'));
    await runOutboxOnce();
    expect(mockPrisma.posOutbox.update).toHaveBeenCalledWith({ where: { id: 4 }, data: { status: 'PENDING' } });
    expect(mockPrisma.posOutbox.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ attempts: expect.any(Number) }) }),
    );
  });
});
