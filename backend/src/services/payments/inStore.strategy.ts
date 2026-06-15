import { OrderStatus, PaymentMethodEnum } from '../../../generated/prisma';
import { AppError } from '../../middleware/error.middleware';
import { DeliveryMethod } from '../../constants/orderMethods';
import { PaymentStrategy, OrderContext } from './PaymentStrategy';

export class InStorePaymentStrategy implements PaymentStrategy {
  readonly method = PaymentMethodEnum.IN_STORE;

  validate(ctx: OrderContext): void {
    if (ctx.deliveryMethod !== DeliveryMethod.PICKUP && ctx.deliveryMethod !== DeliveryMethod.CURBSIDE) {
      throw new AppError('Pay in store is only available for pickup and curbside orders', 400);
    }
  }

  initialStatus(): OrderStatus {
    return OrderStatus.PENDING;
  }

  async applyInTransaction(_tx: any, _orderId: number, _ctx: OrderContext): Promise<void> {
    // No in-transaction side-effects for in-store payment.
  }

  notifiesOnCreate(): boolean {
    return true;
  }

  async refundOnDelete(_orderId: number, _userId: number, _total: number): Promise<void> {
    // Nothing to refund — not yet paid.
  }
}
