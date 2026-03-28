import { Request, Response, NextFunction } from 'express';
import { StoreSettingsService } from '../services/storeSettings.service';

const storeSettingsService = new StoreSettingsService();

export class StoreSettingsController {
  async getStoreSettings(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const settings = await storeSettingsService.getStoreSettings();
      res.status(200).json(settings);
    } catch (error) {
      next(error);
    }
  }

  async updateStoreSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const settings = await storeSettingsService.updateStoreSettings(req.body);
      res.status(200).json({ message: 'Store settings updated successfully', settings });
    } catch (error) {
      next(error);
    }
  }
}
