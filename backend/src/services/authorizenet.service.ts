import { AppError } from '../middleware/error.middleware';
import { CCPaymentSettings } from './paymentSettings.service';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const defaultSDK = require('authorizenet');

export class AuthorizeNetService {
  private sdk: typeof defaultSDK;

  constructor(sdk?: typeof defaultSDK) {
    this.sdk = sdk ?? defaultSDK;
  }

  private get APIContracts() { return this.sdk.APIContracts; }
  private get APIControllers() { return this.sdk.APIControllers; }
  private get Constants() { return this.sdk.Constants; }

  private getMerchantAuth(settings: CCPaymentSettings) {
    const auth = new this.APIContracts.MerchantAuthenticationType();
    auth.setName(settings.loginId);
    auth.setTransactionKey(settings.transactionKey);
    return auth;
  }

  private getEnvironment(sandboxMode: boolean): string {
    return sandboxMode ? this.Constants.endpoint.sandbox : this.Constants.endpoint.production;
  }

  async getHostedPageToken(
    orderId: number,
    amount: number,
    communicatorUrl: string,
    settings: CCPaymentSettings
  ): Promise<string> {
    const { APIContracts, APIControllers } = this;

    return new Promise((resolve, reject) => {
      const transactionRequest = new APIContracts.TransactionRequestType();
      transactionRequest.setTransactionType(APIContracts.TransactionTypeEnum.AUTHCAPTURETRANSACTION);
      transactionRequest.setAmount(amount.toFixed(2));

      // Bind the transaction to the order so verifyTransaction can confirm the
      // payment belongs to this specific order, not just any order with the same total.
      const orderType = new APIContracts.OrderType();
      orderType.setInvoiceNumber(String(orderId));
      transactionRequest.setOrder(orderType);

      const communicatorSetting = new APIContracts.SettingType();
      communicatorSetting.setSettingName('hostedPaymentIFrameCommunicatorUrl');
      communicatorSetting.setSettingValue(JSON.stringify({ url: communicatorUrl }));

      const returnSetting = new APIContracts.SettingType();
      returnSetting.setSettingName('hostedPaymentReturnOptions');
      returnSetting.setSettingValue(JSON.stringify({
        showReceipt: false,
        url: communicatorUrl,
        urlText: 'Return',
        cancelUrl: communicatorUrl,
        cancelUrlText: 'Cancel',
      }));

      const settingList = new APIContracts.ArrayOfSetting();
      settingList.setSetting([communicatorSetting, returnSetting]);

      const request = new APIContracts.GetHostedPaymentPageRequest();
      request.setMerchantAuthentication(this.getMerchantAuth(settings));
      request.setTransactionRequest(transactionRequest);
      request.setHostedPaymentSettings(settingList);

      const controller = new APIControllers.GetHostedPaymentPageController(request.getJSON());
      controller.setEnvironment(this.getEnvironment(settings.sandboxMode));

      controller.execute(() => {
        const apiResponse = controller.getResponse();
        const response = new APIContracts.GetHostedPaymentPageResponse(apiResponse);

        if (!response || response.getMessages().getResultCode() !== APIContracts.MessageTypeEnum.OK) {
          const msgs = response?.getMessages()?.getMessage?.();
          return reject(new AppError(msgs?.[0]?.getText?.() ?? 'Failed to initialize payment', 502));
        }

        resolve(response.getToken());
      });
    });
  }

  async verifyTransaction(
    transId: string,
    expectedAmount: number,
    expectedOrderId: number,
    settings: CCPaymentSettings
  ): Promise<void> {
    const { APIContracts, APIControllers } = this;

    return new Promise((resolve, reject) => {
      const request = new APIContracts.GetTransactionDetailsRequest();
      request.setMerchantAuthentication(this.getMerchantAuth(settings));
      request.setTransId(transId);

      const controller = new APIControllers.GetTransactionDetailsController(request.getJSON());
      controller.setEnvironment(this.getEnvironment(settings.sandboxMode));

      controller.execute(() => {
        const apiResponse = controller.getResponse();
        const response = new APIContracts.GetTransactionDetailsResponse(apiResponse);

        if (!response || response.getMessages().getResultCode() !== APIContracts.MessageTypeEnum.OK) {
          return reject(new AppError('Could not verify payment transaction', 502));
        }

        const txn = response.getTransaction();
        const status: string = txn.getTransactionStatus();
        const validStatuses = ['settledSuccessfully', 'capturedPendingSettlement'];

        if (!validStatuses.includes(status)) {
          return reject(new AppError(`Payment not confirmed (status: ${status})`, 400));
        }

        const invoiceNumber = txn.getOrder?.()?.getInvoiceNumber?.();
        if (invoiceNumber !== String(expectedOrderId)) {
          return reject(new AppError('Payment is not associated with this order', 400));
        }

        const rawAmount = txn.getSettleAmount() ?? txn.getAuthAmount() ?? '0';
        const settledAmount = parseFloat(rawAmount);
        if (Math.abs(settledAmount - expectedAmount) > 0.01) {
          return reject(new AppError('Payment amount mismatch', 400));
        }

        resolve();
      });
    });
  }
}

export const authorizeNetService = new AuthorizeNetService();
