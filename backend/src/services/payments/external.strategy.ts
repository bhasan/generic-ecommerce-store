import { OrderStatus, PaymentMethodEnum } from '../../../generated/prisma';
import { PaymentStrategy, OrderContext } from './PaymentStrategy';

export class ExternalPaymentStrategy implements PaymentStrategy {
  readonly method = PaymentMethodEnum.EXTERNAL;

  validate(_ctx: OrderContext): void {
    // No restrictions — always available.
  }

  initialStatus(): OrderStatus {
    return OrderStatus.PENDING;
  }

  async applyInTransaction(_tx: any, _orderId: number, _ctx: OrderContext): Promise<void> {
    // No in-transaction side-effects for external payment.
  }

  notifiesOnCreate(): boolean {
    return true;
  }

  async refundOnDelete(_orderId: number, _userId: number, _total: number): Promise<void> {
    // Nothing to refund — payment was external.
  }
}
