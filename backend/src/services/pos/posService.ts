import prisma from '../../config/database';
import { logger } from '../../utils/logger';
import { StoreSettingsService } from '../storeSettings.service';
import { getPosProvider } from './registry';
import { retryWithBackoff } from './retry';
import { PosOrderPayload } from './PosProvider';

async function buildPayload(orderId: number): Promise<PosOrderPayload | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: true,
      payments: true,
    },
  });

  if (!order) {
    logger.warn('POS: order not found', { orderId });
    return null;
  }

  const payload: PosOrderPayload = {
    id: order.id,
    status: order.status,
    subtotal: order.subtotal.toNumber(),
    tax: order.tax.toNumber(),
    total: order.total.toNumber(),
    deliveryMethod: order.deliveryMethod,
    items: order.items.map(i => ({
      productName: i.productName,
      variantLabel: i.variantLabel,
      quantity: i.quantity,
      unitPrice: i.unitPrice.toNumber(),
    })),
    payments: order.payments.map(p => ({
      id: p.id,
      method: p.method,
      amount: p.amount.toNumber(),
      status: p.status,
    })),
  };

  return payload;
}

export async function pushOrderCreated(orderId: number): Promise<void> {
  const settings = await new StoreSettingsService().getStoreSettings();
  const provider = getPosProvider(settings as any);
  if (!provider) return;

  const payload = await buildPayload(orderId);
  if (!payload) return;

  await retryWithBackoff(() => provider.pushOrder(payload), { label: 'ForeverPOS pushOrder', context: { orderId } });
  await retryWithBackoff(() => provider.pushPayment(payload), { label: 'ForeverPOS pushPayment', context: { orderId } });
}

export async function pushOrderUpdated(orderId: number): Promise<void> {
  const settings = await new StoreSettingsService().getStoreSettings();
  const provider = getPosProvider(settings as any);
  if (!provider) return;

  const payload = await buildPayload(orderId);
  if (!payload) return;

  if (!provider.shouldPushStatus(payload.status)) return;

  await retryWithBackoff(() => provider.pushOrder(payload), { label: 'ForeverPOS pushOrder', context: { orderId } });
  await retryWithBackoff(() => provider.pushPayment(payload), { label: 'ForeverPOS pushPayment', context: { orderId } });
}
