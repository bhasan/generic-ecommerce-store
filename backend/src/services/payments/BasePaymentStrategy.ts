import { PaymentMethodEnum, OrderStatus } from '../../../generated/prisma';
import { PaymentStrategy, OrderContext } from './PaymentStrategy';
import { AppError } from '../../middleware/error.middleware';

export abstract class BasePaymentStrategy implements PaymentStrategy {
  abstract readonly method: PaymentMethodEnum;

  abstract validate(ctx: OrderContext): void;

  abstract initialStatus(): OrderStatus;

  abstract applyInTransaction(tx: any, orderId: number, ctx: OrderContext): Promise<void>;

  abstract notifiesOnCreate(): boolean;

  abstract refundOnDelete(orderId: number, userId: number, total: number): Promise<void>;

  async initializePaymentSession(_orderId: number, _total: number): Promise<{ token: string; paymentFormUrl: string }> {
    throw new AppError('Payment session initialization is not supported for this payment method', 400);
  }

  async confirmPayment(_orderId: number, _userId: number, _transId: string, _total: number): Promise<{ id: number; status: string }> {
    throw new AppError('Payment confirmation is not supported for this payment method', 400);
  }
}
