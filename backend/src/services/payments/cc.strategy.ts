import { OrderStatus, PaymentMethodEnum } from '../../../generated/prisma';
import { OrderContext } from './PaymentStrategy';
import { BasePaymentStrategy } from './BasePaymentStrategy';
import { authorizeNetService } from '../authorizenet.service';
import { PaymentSettingsService } from '../paymentSettings.service';

const paymentSettingsService = new PaymentSettingsService();
import { AppError } from '../../middleware/error.middleware';
import prisma from '../../config/database';

export class CcPaymentStrategy extends BasePaymentStrategy {
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

  async initializePaymentSession(orderId: number, total: number) {
    const settings = await paymentSettingsService.getPaymentSettings();
    if (!settings.cc_payment?.enabled) throw new AppError('Card payments are not enabled', 400);

    const corsOrigin = process.env.CORS_ORIGIN;
    if (!corsOrigin) {
      throw new AppError('Card payments are unavailable: CORS_ORIGIN is not configured', 503);
    }
    const communicatorUrl = `${corsOrigin}/communicator.html`;

    const token = await authorizeNetService.getHostedPageToken(
      orderId,
      total,
      communicatorUrl,
      settings.cc_payment
    );

    const paymentFormUrl = settings.cc_payment.sandboxMode
      ? 'https://test.authorize.net/payment/payment'
      : 'https://accept.authorize.net/payment/payment';

    return { token, paymentFormUrl };
  }

  async confirmPayment(orderId: number, _userId: number, transId: string, total: number) {
    const settings = await paymentSettingsService.getPaymentSettings();
    await authorizeNetService.verifyTransaction(transId, total, orderId, settings.cc_payment);

    const updated = await prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.PENDING },
    });

    return { id: updated.id, status: updated.status };
  }
}
