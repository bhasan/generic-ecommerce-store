import { PosOrderSync, PosContext, PosPaymentPayload } from '../../orders/PosOrderSync';
import { ForeverPosClient, ForeverPosConfig } from './client';

export const STATUS_MAP: Record<string, string> = {
  APPROVED: 'Processing',
  READY_FOR_PICKUP: 'Ready',
  ARRIVED: 'Ready',
  OUT_FOR_DELIVERY: 'Out for Delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

const money = (n: number): number => Number(n.toFixed(2));

export function paymentBuckets(payments: PosPaymentPayload[]): { cash: number; credit: number; otherPayment: number } {
  const buckets = { cash: 0, credit: 0, otherPayment: 0 };
  for (const p of payments) {
    if (p.status !== 'SETTLED') continue;
    switch (p.method) {
      case 'CC': buckets.credit += p.amount; break;
      case 'STORE_CREDIT': buckets.otherPayment += p.amount; break;
      default: buckets.cash += p.amount; break;
    }
  }
  return { cash: money(buckets.cash), credit: money(buckets.credit), otherPayment: money(buckets.otherPayment) };
}

export class ForeverPosOrderSync implements PosOrderSync {
  constructor(private readonly client: ForeverPosClient, private readonly cfg: ForeverPosConfig) {}

  shouldPushStatus(status: string): boolean {
    return status in STATUS_MAP;
  }

  async pushOrder(ctx: PosContext): Promise<{ externalId: string | null }> {
    const o = ctx.order;
    const { cash, credit, otherPayment } = paymentBuckets(o.payments);
    const grand = money(o.total);
    const body = {
      total: money(o.subtotal),
      grandTotal: grand,
      vat: money(o.tax),
      discount: 0,
      cash, credit, otherPayment,
      applyAutomaticPromotions: false,
      orderType: 'online',
      status: STATUS_MAP[o.status] ?? o.status,
      note: `Online Order #${o.id}`,
      items: [{
        productId: this.cfg.sakCatchAllProductId,
        productVariantId: this.cfg.sakCatchAllVariantId,
        productName: `Online Order #${o.id}`,
        rate: grand,
        quantity: 1,
        unitDiscountAmount: 0,
        subTotal: grand,
        vatAmount: 0,
        totalVat: 0,
        total: grand,
      }],
    };
    const res = await this.client.request<{ voucherId: number }>('POST', '/api/Voucher/order', body);
    return { externalId: res?.voucherId != null ? String(res.voucherId) : null };
  }

  async pushStatus(ctx: PosContext): Promise<void> {
    if (!ctx.externalId) throw new Error(`pushStatus requires externalId for order ${ctx.order.id}`);
    const value = STATUS_MAP[ctx.order.status] ?? ctx.order.status;
    await this.client.request('PUT', '/api/Voucher/bulk-update', {
      ids: [Number(ctx.externalId)],
      action: 'Update',
      field: 'status',
      value,
    });
  }
}
