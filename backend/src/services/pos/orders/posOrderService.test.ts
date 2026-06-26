import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/database', () => ({ default: {
  order: { findUnique: vi.fn() },
  orderPosMapping: { findUnique: vi.fn(), create: vi.fn() },
  posOutbox: { count: vi.fn() },
} }));
const getStoreSettings = vi.hoisted(() => vi.fn());
const getOrderSync = vi.hoisted(() => vi.fn());

vi.mock('../../storeSettings.service', () => ({ StoreSettingsService: vi.fn(() => ({ getStoreSettings: getStoreSettings })) }));
vi.mock('../registry', () => ({ getOrderSync: getOrderSync }));
vi.mock('../../../utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import prisma from '../../../config/database';
import { enqueue, processOutboxRow } from './posOrderService';

const mockOrder = {
  id: 5, status: 'APPROVED', deliveryMethod: 'PICKUP',
  subtotal: { toNumber: () => 10 }, tax: { toNumber: () => 0.5 }, total: { toNumber: () => 10.5 },
  items: [{ productName: 'X', variantLabel: 'g', quantity: 1, unitPrice: { toNumber: () => 10 }, voided: false }],
  payments: [{ id: 1, method: 'CC', amount: { toNumber: () => 10.5 }, status: 'SETTLED' }],
};

beforeEach(() => {
  vi.clearAllMocks();
  getStoreSettings.mockResolvedValue({ posProvider: 'foreverpos', posConfig: {} });
});

describe('enqueue', () => {
  it('creates a pos_outbox row on the given tx', async () => {
    const tx = { posOutbox: { create: vi.fn() } } as any;
    await enqueue(tx, 5, 'ORDER_CREATED');
    expect(tx.posOutbox.create).toHaveBeenCalledWith({ data: { orderId: 5, provider: 'foreverpos', type: 'ORDER_CREATED' } });
  });
});

describe('processOutboxRow ORDER_CREATED', () => {
  it('pushes order, stores mapping', async () => {
    (prisma as any).orderPosMapping.findUnique.mockResolvedValue(null);
    (prisma as any).order.findUnique.mockResolvedValue(mockOrder);
    const provider = { shouldPushStatus: () => true, pushOrder: vi.fn().mockResolvedValue({ externalId: '321' }), pushStatus: vi.fn() };
    getOrderSync.mockReturnValue(provider);

    await processOutboxRow({ id: 1, orderId: 5, provider: 'foreverpos', type: 'ORDER_CREATED', attempts: 0 });

    expect(provider.pushOrder).toHaveBeenCalledWith(expect.objectContaining({ order: expect.objectContaining({ id: 5 }) }));
    expect((prisma as any).orderPosMapping.create).toHaveBeenCalledWith({ data: { orderId: 5, provider: 'foreverpos', externalId: '321' } });
  });

  it('is idempotent when a mapping already exists', async () => {
    (prisma as any).orderPosMapping.findUnique.mockResolvedValue({ externalId: '321' });
    const provider = { shouldPushStatus: () => true, pushOrder: vi.fn(), pushStatus: vi.fn() };
    getOrderSync.mockReturnValue(provider);
    await processOutboxRow({ id: 1, orderId: 5, provider: 'foreverpos', type: 'ORDER_CREATED', attempts: 0 });
    expect(provider.pushOrder).not.toHaveBeenCalled();
  });
});

describe('processOutboxRow ORDER_UPDATED', () => {
  it('defers (throws) when no mapping yet', async () => {
    (prisma as any).orderPosMapping.findUnique.mockResolvedValue(null);
    (prisma as any).order.findUnique.mockResolvedValue(mockOrder);
    getOrderSync.mockReturnValue({ shouldPushStatus: () => true, pushOrder: vi.fn(), pushStatus: vi.fn() });
    await expect(processOutboxRow({ id: 2, orderId: 5, provider: 'foreverpos', type: 'ORDER_UPDATED', attempts: 0 }))
      .rejects.toThrow(/no mapping/i);
  });

  it('pushes status when mapping exists', async () => {
    (prisma as any).orderPosMapping.findUnique.mockResolvedValue({ externalId: '321' });
    (prisma as any).order.findUnique.mockResolvedValue({ ...mockOrder, status: 'DELIVERED' });
    const provider = { shouldPushStatus: () => true, pushOrder: vi.fn(), pushStatus: vi.fn().mockResolvedValue(undefined) };
    getOrderSync.mockReturnValue(provider);
    await processOutboxRow({ id: 2, orderId: 5, provider: 'foreverpos', type: 'ORDER_UPDATED', attempts: 0 });
    expect(provider.pushStatus).toHaveBeenCalledWith(expect.objectContaining({ externalId: '321' }));
  });
});
