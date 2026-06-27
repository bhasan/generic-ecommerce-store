import { OrderStatus, PaymentMethodEnum, PaymentStatus, Prisma } from '../../../generated/prisma';
import { AppError } from '../../middleware/error.middleware';
import { DeliveryMethod } from '../../constants/orderMethods';
import { OrderContext } from './PaymentStrategy';
import { BasePaymentStrategy } from './BasePaymentStrategy';

export class InStorePaymentStrategy extends BasePaymentStrategy {
  readonly method = PaymentMethodEnum.IN_STORE;

  validate(ctx: OrderContext): void {
    if (ctx.deliveryMethod !== DeliveryMethod.PICKUP && ctx.deliveryMethod !== DeliveryMethod.CURBSIDE) {
      throw new AppError('Pay in store is only available for pickup and curbside orders', 400);
    }
  }

  initialStatus(): OrderStatus {
    return OrderStatus.PENDING;
  }

  async applyInTransaction(tx: any, orderId: number, ctx: OrderContext): Promise<void> {
    await tx.payment.create({
      data: {
        orderId,
        method: PaymentMethodEnum.IN_STORE,
        status: PaymentStatus.PENDING,
        amount: new Prisma.Decimal(ctx.total),
        paymentHandle: null,
      },
    });
  }

  notifiesOnCreate(): boolean {
    return true;
  }

  async refundOnDelete(_orderId: number, _userId: number, _total: number): Promise<void> {
    // Nothing to refund — not yet paid.
  }
}
