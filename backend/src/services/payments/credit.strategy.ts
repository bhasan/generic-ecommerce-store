import { OrderStatus, PaymentMethodEnum } from '../../../generated/prisma';
import { AppError } from '../../middleware/error.middleware';
import { PaymentStrategy, OrderContext } from './PaymentStrategy';
import creditService from '../credit.service';

export class CreditPaymentStrategy implements PaymentStrategy {
  readonly method = PaymentMethodEnum.CREDIT;

  validate(_ctx: OrderContext): void {
    // Balance enforcement happens inside applyInTransaction via creditService.useCredit(),
    // which reads the live DB balance inside the transaction. Pre-checking here would require
    // an extra DB round-trip and creditBalance is not available in CreateOrderData.
    // The frontend paymentRegistry already provides the UX-level guard.
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
