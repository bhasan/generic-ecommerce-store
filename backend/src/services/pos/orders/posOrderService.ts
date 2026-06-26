import prisma from '../../../config/database';
import { Prisma } from '../../../../generated/prisma';
import { logger } from '../../../utils/logger';
import { StoreSettingsService } from '../../storeSettings.service';
import { getOrderSync } from '../registry';
import { PosContext, PosOrderPayload } from './PosOrderSync';

const PROVIDER = 'foreverpos';

export async function enqueue(
  tx: Prisma.TransactionClient,
  orderId: number,
  type: 'ORDER_CREATED' | 'ORDER_UPDATED',
): Promise<void> {
  await tx.posOutbox.create({ data: { orderId, provider: PROVIDER, type } });
  logger.info('POS outbox enqueued', { event: 'pos_outbox_enqueued', orderId, type });
}

export async function countPending(): Promise<number> {
  return prisma.posOutbox.count({ where: { status: 'PENDING' } });
}

async function buildPayload(orderId: number): Promise<PosOrderPayload | null> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true, payments: true } });
  if (!order) { logger.warn('POS: order not found', { orderId }); return null; }
  return {
    id: order.id,
    status: order.status,
    subtotal: order.subtotal.toNumber(),
    tax: order.tax.toNumber(),
    total: order.total.toNumber(),
    deliveryMethod: order.deliveryMethod,
    items: order.items.filter(i => !i.voided).map(i => ({
      productName: i.productName, variantLabel: i.variantLabel, quantity: i.quantity, unitPrice: i.unitPrice.toNumber(),
    })),
    payments: order.payments.map(p => ({ id: p.id, method: p.method, amount: p.amount.toNumber(), status: p.status })),
  };
}

export async function processOutboxRow(row: {
  id: number; orderId: number; provider: string; type: string; attempts: number;
}): Promise<void> {
  const settings = await new StoreSettingsService().getStoreSettings();
  const provider = getOrderSync(settings);
  if (!provider) { logger.warn('POS provider unavailable; skipping row', { orderId: row.orderId, rowId: row.id }); return; }

  if (row.type === 'ORDER_CREATED') {
    const existing = await prisma.orderPosMapping.findUnique({ where: { orderId_provider: { orderId: row.orderId, provider: PROVIDER } } });
    if (existing) return;

    const payload = await buildPayload(row.orderId);
    if (!payload) return;
    const ctx: PosContext = { order: payload };
    const { externalId } = await provider.pushOrder(ctx);
    if (!externalId) throw new Error(`pushOrder returned no externalId for order ${row.orderId}`);
    await prisma.orderPosMapping.create({ data: { orderId: row.orderId, provider: PROVIDER, externalId } });
    logger.info('POS order created', { event: 'pos_outbox_success', type: row.type, orderId: row.orderId, voucherId: externalId });
    return;
  }

  if (row.type === 'ORDER_UPDATED') {
    const mapping = await prisma.orderPosMapping.findUnique({ where: { orderId_provider: { orderId: row.orderId, provider: PROVIDER } } });
    if (!mapping) throw new Error(`no mapping yet for order ${row.orderId} (defer ORDER_UPDATED)`);
    const payload = await buildPayload(row.orderId);
    if (!payload) return;
    await provider.pushStatus({ order: payload, externalId: mapping.externalId });
    logger.info('POS status updated', { event: 'pos_outbox_success', type: row.type, orderId: row.orderId, voucherId: mapping.externalId });
    return;
  }

  throw new Error(`unknown outbox type: ${row.type}`);
}
