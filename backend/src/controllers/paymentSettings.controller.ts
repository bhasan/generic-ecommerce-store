import { Request, Response } from 'express';
import { PaymentSettingsService } from '../services/paymentSettings.service';

const paymentSettingsService = new PaymentSettingsService();

export class PaymentSettingsController {
  async getPaymentSettings(_req: Request, res: Response) : Promise<void> {
    const settings = await paymentSettingsService.getPaymentSettings();
    res.status(200).json(settings);
  }

  async updatePaymentSettings(req: Request, res: Response) : Promise<void> {
    const settings = await paymentSettingsService.updatePaymentSettings(req.body);
    res.status(200).json({ message: 'Payment settings updated successfully', settings });
  }
}
