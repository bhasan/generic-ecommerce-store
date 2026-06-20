import { OrderStatus, PaymentMethodEnum } from '../../../generated/prisma';
import { PaymentStrategy, OrderContext } from './PaymentStrategy';

export class CcPaymentStrategy implements PaymentStrategy {
  readonly method = PaymentMethodEnum.CC;

  validate(_ctx: OrderContext): void {
    // Availability is controlled by payment settings; no context-level guard needed here.
  }

  initialStatus(): OrderStatus {
    // CC orders wait for Authorize.Net confirmation before becoming PENDING.
    return OrderStatus.PENDING_PAYMENT;
  }

  async applyInTransaction(_tx: any, _orderId: number, _ctx: OrderContext): Promise<void> {
    // No in-transaction side-effects — payment captured later via confirmCardPayment.
  }

  notifiesOnCreate(): boolean {
    // Notifications deferred until confirmCardPayment so staff only see paid orders.
    return false;
  }

  async refundOnDelete(_orderId: number, _userId: number, _total: number): Promise<void> {
    // PENDING_PAYMENT orders were never charged; nothing to refund.
  }
}
