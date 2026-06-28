import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { OrderStatus, PaymentMethodEnum } from '../../generated/prisma';
import { PaymentMethod } from '../constants/orderMethods';
import { getPaymentStrategy } from './payments/registry';
import { dispatchOrderCreatedEffects } from './order.crud.service';

// Resolves the Authorize.net communicator.html callback URL from server config only.
// Never uses client-supplied values — the Origin header is attacker-controlled and
// accepting it would let an adversary redirect the payment callback to their domain.
export function resolveCommunicatorUrl(): string {
  const corsOrigin = process.env.CORS_ORIGIN;
  if (!corsOrigin) {
    throw new AppError(
      'Card payments are unavailable: CORS_ORIGIN is not configured',
      503
    );
  }
  return `${corsOrigin}/communicator.html`;
}

export class OrderPaymentService {
  async getPaymentToken(orderId: number, userId: number): Promise<{ token: string; paymentFormUrl: string }> {
    const order = await prisma.order.findUnique({ where: { id: orderId } });

    if (!order) throw new AppError('Order not found', 404);
    if (order.userId !== userId) throw new AppError('Not authorized', 403);
    if (order.paymentMethod !== PaymentMethod.CC) throw new AppError('Order is not a card payment', 400);
    if (order.status !== OrderStatus.PENDING_PAYMENT) throw new AppError('Order is not awaiting payment', 400);

    const strategy = getPaymentStrategy(order.paymentMethod as PaymentMethodEnum);
    if (!strategy.initializePaymentSession) {
      throw new AppError('Payment strategy does not support session initialization', 400);
    }
    return strategy.initializePaymentSession(orderId, order.total.toNumber());
  }

  async confirmCardPayment(orderId: number, userId: number, transId: string): Promise<{ id: number; status: string }> {
    const order = await prisma.order.findUnique({ where: { id: orderId } });

    if (!order) throw new AppError('Order not found', 404);
    if (order.userId !== userId) throw new AppError('Not authorized', 403);
    if (order.paymentMethod !== PaymentMethod.CC) throw new AppError('Order is not a card payment', 400);
    if (order.status !== OrderStatus.PENDING_PAYMENT) throw new AppError('Order is not awaiting payment', 400);

    // Replay protection: the same transaction must not confirm two orders.
    // The @unique constraint on Payment.transactionId is the hard backstop; this check gives a clean error.
    const duplicate = await prisma.payment.findFirst({
      where: { transactionId: transId, NOT: { orderId } },
    });
    if (duplicate) throw new AppError('This payment has already been applied to another order', 400);

    const strategy = getPaymentStrategy(order.paymentMethod as PaymentMethodEnum);
    if (!strategy.confirmPayment) {
      throw new AppError('Payment strategy does not support confirmation', 400);
    }
    const result = await strategy.confirmPayment(orderId, userId, transId, order.total.toNumber());

    await dispatchOrderCreatedEffects(orderId, userId);

    return result;
  }
}
