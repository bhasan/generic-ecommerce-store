// backend/src/services/pos/orders/outboxPerStore.test.ts
//
// Per-store POS-outbox verification (Task 5, Phase 2c).
// Verifies that the outbox worker resolves POS config from the ROW's store:
// two stores within the same tenant have different store_settings.posConfig
// → a row for store A resolves store A's provider config
// → a row for store B resolves store B's provider config
//
// The outbox worker already re-enters runWithTenant({ tenantId, storeId: row.storeId })
// per row (Phase 1), and getStoreSettings() is store-scoped (Phase 2b), so the context
// storeId drives which settings are fetched. This test locks that behaviour.
//
// If any assertion FAILS, the per-store POS routing is broken — stop and report.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTenantContext } from '../../../config/tenantContext';

// ── Shared mocks (same pattern as outboxWorker.test.ts) ─────────────────────
const mockPrisma = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  $transaction: vi.fn(),
  posOutbox: {
    update: vi.fn(),
    updateMany: vi.fn(),
    count: vi.fn().mockResolvedValue(0),
  },
}));
vi.mock('../../../config/database', () => ({
  default: mockPrisma,
  getUnscopedPrisma: () => mockPrisma,
}));
vi.mock('./posOrderService', () => ({
  processOutboxRow: vi.fn(),
  DeferralError: class DeferralError extends Error {
    constructor(m: string) { super(m); this.name = 'DeferralError'; }
  },
}));
const getStoreSettings = vi.hoisted(() => vi.fn());
vi.mock('../../storeSettings.service', () => ({
  StoreSettingsService: vi.fn(() => ({ getStoreSettings })),
}));
vi.mock('../registry', () => ({ getOrderSync: vi.fn() }));
vi.mock('../../../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { processOutboxRow as runProcessOutboxRow } from './posOrderService';
import { runOutboxOnce } from './outboxWorker';
import { getOrderSync } from '../registry';

// ── Fixtures ─────────────────────────────────────────────────────────────────
const TENANT_ID = 1;
const STORE_A_ID = 10;
const STORE_B_ID = 20;

/** Store A's POS config — distinct baseUrl so assertions can tell them apart. */
const configA = {
  posProvider: 'foreverpos',
  posConfig: {
    baseUrl: 'https://pos-a.example',
    username: 'userA',
    password: 'passA',
    sakCatchAllProductId: 1,
    sakCatchAllVariantId: 2,
  },
};

/** Store B's POS config — intentionally different baseUrl. */
const configB = {
  posProvider: 'foreverpos',
  posConfig: {
    baseUrl: 'https://pos-b.example',
    username: 'userB',
    password: 'passB',
    sakCatchAllProductId: 3,
    sakCatchAllVariantId: 4,
  },
};

/** A mock getStoreSettings that returns config keyed by the active storeId. */
function storeAwareMock(storeMap: Record<number, typeof configA>) {
  return async () => {
    const ctx = getTenantContext();
    const storeId = ctx?.storeId ?? 0;
    const cfg = storeMap[storeId];
    if (!cfg) throw new Error(`outboxPerStore.test: unexpected storeId ${storeId} in context`);
    return cfg;
  };
}

/** Factory for a minimal PENDING outbox row. */
function row(id: number, orderId: number, storeId: number) {
  return { id, orderId, provider: 'foreverpos', type: 'ORDER_CREATED', attempts: 0, tenantId: TENANT_ID, storeId };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.posOutbox.count.mockResolvedValue(0);
  // $transaction executes the callback with the same mock so $queryRaw is intercepted.
  mockPrisma.$transaction.mockImplementation(
    (fn: (tx: typeof mockPrisma) => unknown) => fn(mockPrisma),
  );
  (runProcessOutboxRow as any).mockResolvedValue(undefined);
  (getOrderSync as any).mockReturnValue({
    shouldPushStatus: vi.fn(),
    pushOrder: vi.fn(),
    pushStatus: vi.fn(),
  });
});

describe('per-store POS-outbox resolution', () => {
  it('row for store A is processed with store A\'s POS config', async () => {
    getStoreSettings.mockImplementation(storeAwareMock({ [STORE_A_ID]: configA, [STORE_B_ID]: configB }));
    mockPrisma.$queryRaw.mockResolvedValue([row(1, 5, STORE_A_ID)]);

    await runOutboxOnce();

    expect(getOrderSync).toHaveBeenCalledOnce();
    expect(getOrderSync).toHaveBeenCalledWith(
      expect.objectContaining({
        posProvider: 'foreverpos',
        posConfig: expect.objectContaining({ baseUrl: 'https://pos-a.example' }),
      }),
    );
    expect(mockPrisma.posOutbox.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { status: 'DONE' },
    });
  });

  it('row for store B is processed with store B\'s POS config', async () => {
    getStoreSettings.mockImplementation(storeAwareMock({ [STORE_A_ID]: configA, [STORE_B_ID]: configB }));
    mockPrisma.$queryRaw.mockResolvedValue([row(2, 6, STORE_B_ID)]);

    await runOutboxOnce();

    expect(getOrderSync).toHaveBeenCalledOnce();
    expect(getOrderSync).toHaveBeenCalledWith(
      expect.objectContaining({
        posProvider: 'foreverpos',
        posConfig: expect.objectContaining({ baseUrl: 'https://pos-b.example' }),
      }),
    );
    expect(mockPrisma.posOutbox.update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: { status: 'DONE' },
    });
  });

  it('a batch with rows for both stores resolves each row\'s own store config (same tenant)', async () => {
    const resolvedBaseUrls: string[] = [];

    getStoreSettings.mockImplementation(storeAwareMock({ [STORE_A_ID]: configA, [STORE_B_ID]: configB }));
    (getOrderSync as any).mockImplementation((settings: typeof configA) => {
      resolvedBaseUrls.push(settings.posConfig.baseUrl!);
      return { shouldPushStatus: vi.fn(), pushOrder: vi.fn(), pushStatus: vi.fn() };
    });
    mockPrisma.$queryRaw.mockResolvedValue([
      row(1, 5, STORE_A_ID),
      row(2, 6, STORE_B_ID),
    ]);

    await runOutboxOnce();

    // Each row resolves its own store's POS config — in row order.
    expect(resolvedBaseUrls).toEqual([
      'https://pos-a.example',
      'https://pos-b.example',
    ]);
    expect(getOrderSync).toHaveBeenCalledTimes(2);
    expect(mockPrisma.posOutbox.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { status: 'DONE' } });
    expect(mockPrisma.posOutbox.update).toHaveBeenCalledWith({ where: { id: 2 }, data: { status: 'DONE' } });
  });

  it('the ALS context storeId matches the row\'s storeId inside the handler', async () => {
    const seenStoreIds: (number | null)[] = [];

    getStoreSettings.mockImplementation(async () => {
      seenStoreIds.push(getTenantContext()?.storeId ?? null);
      return configA; // value doesn't matter for this assertion
    });
    mockPrisma.$queryRaw.mockResolvedValue([
      row(1, 5, STORE_A_ID),
      row(2, 6, STORE_B_ID),
    ]);

    await runOutboxOnce();

    expect(seenStoreIds).toEqual([STORE_A_ID, STORE_B_ID]);
  });
});
