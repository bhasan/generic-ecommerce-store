import { Request, Response, NextFunction } from 'express';
import { PaymentSettingsService } from '../services/paymentSettings.service';

const paymentSettingsService = new PaymentSettingsService();

export class PaymentSettingsController {
  /**
   * GET /api/payment-settings
   * Admin only
   */
  async getPaymentSettings(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const settings = await paymentSettingsService.getPaymentSettings();
      res.status(200).json(settings);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/payment-settings
   * Admin only
   */
  async updatePaymentSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const settings = await paymentSettingsService.updatePaymentSettings(req.body);
      res.status(200).json({ message: 'Payment settings updated successfully', settings });
    } catch (error) {
      next(error);
    }
  }
}
