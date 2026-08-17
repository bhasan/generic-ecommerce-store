import { Request, Response } from 'express';
import { PaymentSettingsService } from '../services/paymentSettings.service';
import { successResponse } from '../utils/responseEnvelope';

const paymentSettingsService = new PaymentSettingsService();

export class PaymentSettingsController {
  async getPaymentSettings(_req: Request, res: Response) : Promise<void> {
    const settings = await paymentSettingsService.getPaymentSettings();
    res.status(200).json(successResponse(settings));
  }

  async updatePaymentSettings(req: Request, res: Response) : Promise<void> {
    const settings = await paymentSettingsService.updatePaymentSettings(req.body);
    res.status(200).json(successResponse({ settings }, 'Payment settings updated successfully'));
  }
}
