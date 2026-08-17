import { OrderStatus, PaymentMethodEnum, PaymentStatus, Prisma } from '../../../generated/prisma';
import { OrderContext } from './PaymentStrategy';
import { BasePaymentStrategy } from './BasePaymentStrategy';

export class ExternalPaymentStrategy extends BasePaymentStrategy {
  readonly method = PaymentMethodEnum.EXTERNAL;

  validate(_ctx: OrderContext): void {
    // No restrictions — always available.
  }

  initialStatus(): OrderStatus {
    return OrderStatus.PENDING;
  }

  async applyInTransaction(tx: any, orderId: number, ctx: OrderContext): Promise<void> {
    await tx.payment.create({
      data: {
        orderId,
        method: PaymentMethodEnum.EXTERNAL,
        status: PaymentStatus.PENDING,
        amount: new Prisma.Decimal(ctx.total),
        paymentHandle: ctx.cashAppUsername?.trim() || null,
      },
    });
  }

  notifiesOnCreate(): boolean {
    return true;
  }

  async refundOnDelete(_orderId: number, _userId: number, _total: number): Promise<void> {
    // Nothing to refund — payment was external.
  }
}
