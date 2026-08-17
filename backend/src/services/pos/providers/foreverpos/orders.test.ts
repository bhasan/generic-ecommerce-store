import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../../../utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { ForeverPosOrderSync } from './orders';
import type { PosContext } from '../../orders/PosOrderSync';

const cfg = { baseUrl: 'https://sak.test', username: 'u', password: 'p', sakCatchAllProductId: 1, sakCatchAllVariantId: 2 };

function ctx(over: Partial<PosContext['order']> = {}, externalId?: string): PosContext {
  return {
    externalId,
    order: {
      id: 55, status: 'APPROVED', subtotal: 10, tax: 0.5, total: 10.5, deliveryMethod: 'PICKUP',
      items: [{ productName: 'X', variantLabel: 'g', quantity: 1, unitPrice: 10 }],
      payments: [{ id: 9, method: 'CC', amount: 10.5, status: 'SETTLED' }],
      ...over,
    },
  };
}

let client: { request: ReturnType<typeof vi.fn> };
beforeEach(() => { client = { request: vi.fn() }; });

describe('ForeverPosOrderSync.shouldPushStatus', () => {
  it('accepts mapped statuses, rejects unmapped', () => {
    const s = new ForeverPosOrderSync(client as any, cfg as any);
    expect(s.shouldPushStatus('APPROVED')).toBe(true);
    expect(s.shouldPushStatus('DELIVERED')).toBe(true);
    expect(s.shouldPushStatus('PENDING')).toBe(false);
  });
});

describe('ForeverPosOrderSync.pushOrder', () => {
  it('posts a single catch-all line with CC payment in credit and returns voucherId', async () => {
    client.request.mockResolvedValue({ voucherId: 321 });
    const s = new ForeverPosOrderSync(client as any, cfg as any);
    const res = await s.pushOrder(ctx());
    expect(res).toEqual({ externalId: '321' });
    const [method, path, body] = client.request.mock.calls[0];
    expect(method).toBe('POST');
    expect(path).toBe('/api/Voucher/order');
    expect(body.orderType).toBe('online');
    expect(body.status).toBe('Processing');
    expect(body.credit).toBe(10.5);
    expect(body.cash ?? 0).toBe(0);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].productId).toBe(1);
    expect(body.items[0].productVariantId).toBe(2);
    expect(body.items[0].total).toBe(10.5);
  });

  it('buckets cash payments into cash', async () => {
    client.request.mockResolvedValue({ voucherId: 1 });
    const s = new ForeverPosOrderSync(client as any, cfg as any);
    await s.pushOrder(ctx({ payments: [{ id: 1, method: 'EXTERNAL', amount: 10.5, status: 'SETTLED' }] }));
    const body = client.request.mock.calls[0][2];
    expect(body.cash).toBe(10.5);
    expect(body.credit ?? 0).toBe(0);
  });
});

describe('ForeverPosOrderSync.pushStatus', () => {
  it('sends bulk-update with mapped status', async () => {
    client.request.mockResolvedValue({ updated: 1 });
    const s = new ForeverPosOrderSync(client as any, cfg as any);
    await s.pushStatus(ctx({ status: 'DELIVERED' }, '321'));
    const [method, path, body] = client.request.mock.calls[0];
    expect(method).toBe('PUT');
    expect(path).toBe('/api/Voucher/bulk-update');
    expect(body).toEqual({ ids: [321], action: 'Update', field: 'status', value: 'Delivered' });
  });

  it('throws when externalId is missing', async () => {
    const s = new ForeverPosOrderSync(client as any, cfg as any);
    await expect(s.pushStatus(ctx({ status: 'DELIVERED' }))).rejects.toThrow();
  });
});
