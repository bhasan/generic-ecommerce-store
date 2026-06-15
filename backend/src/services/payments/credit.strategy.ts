import { OrderStatus, PaymentMethodEnum } from '../../../generated/prisma';
import { AppError } from '../../middleware/error.middleware';
import { PaymentStrategy, OrderContext } from './PaymentStrategy';
import creditService from '../credit.service';

export class CreditPaymentStrategy implements PaymentStrategy {
  readonly method = PaymentMethodEnum.CREDIT;

  validate(ctx: OrderContext): void {
    // Skip balance check when total is 0 (early pre-fetch compatibility check with no total yet).
    if (ctx.total === 0) return;
    if ((ctx.creditBalance ?? 0) < ctx.total) {
      throw new AppError(
        `Insufficient credit balance. Available: $${(ctx.creditBalance ?? 0).toFixed(2)}, required: $${ctx.total.toFixed(2)}`,
        400,
      );
    }
  }

  initialStatus(): OrderStatus {
    return OrderStatus.PENDING;
  }

  async applyInTransaction(tx: any, orderId: number, ctx: OrderContext): Promise<void> {
    await creditService.useCredit(ctx.userId, ctx.total, orderId, tx);
  }

  notifiesOnCreate(): boolean {
    return true;
  }

  async refundOnDelete(orderId: number, userId: number, total: number): Promise<void> {
    await creditService.refundCredit(userId, total, orderId, 'Order cancelled');
  }
}
