import { PaymentMethodEnum, OrderStatus } from '../../../generated/prisma';

export interface OrderContext {
  userId: number;
  deliveryMethod: string;
  cashAppUsername?: string;
  total: number;
}

export interface PaymentStrategy {
  readonly method: PaymentMethodEnum;

  /** Throws AppError if the payment method is invalid for the given context. */
  validate(ctx: OrderContext): void;

  /** The order status to set immediately on creation. */
  initialStatus(): OrderStatus;

  /** Side-effects inside the Prisma $transaction (e.g. credit deduction).
   *  tx is typed as any to avoid coupling this interface to a specific Prisma client version. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  applyInTransaction(tx: any, orderId: number, ctx: OrderContext): Promise<void>;

  /** Whether to fire notifications + printing immediately on order creation.
   *  CC returns false — effects are deferred to confirmCardPayment. */
  notifiesOnCreate(): boolean;

  /** Cleanup when an order is deleted (e.g. refund credit). Called outside a transaction. */
  refundOnDelete(orderId: number, userId: number, total: number): Promise<void>;

  /** Optional: Initialize payment token/session for online payment forms (e.g. Authorize.Net). */
  initializePaymentSession?(orderId: number, total: number): Promise<{ token: string; paymentFormUrl: string }>;

  /** Optional: Verify and finalize card payment. */
  confirmPayment?(orderId: number, userId: number, transId: string, total: number): Promise<{ id: number; status: string }>;
}
