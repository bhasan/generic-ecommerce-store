import { Request, Response } from 'express';
import { StoreSettingsService } from '../services/storeSettings.service';

const storeSettingsService = new StoreSettingsService();

export class StoreSettingsController {
  async getStoreSettings(_req: Request, res: Response) : Promise<void> {
    const settings = await storeSettingsService.getStoreSettings();
    res.status(200).json(settings);
  }

  async updateStoreSettings(req: Request, res: Response) : Promise<void> {
    const settings = await storeSettingsService.updateStoreSettings(req.body);
    res.status(200).json({ message: 'Store settings updated successfully', settings });
  }
}
