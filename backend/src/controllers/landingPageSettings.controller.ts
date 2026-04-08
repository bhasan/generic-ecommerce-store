import { Request, Response, NextFunction } from 'express';
import { LandingPageSettingsService } from '../services/landingPageSettings.service';

const landingPageSettingsService = new LandingPageSettingsService();

export class LandingPageSettingsController {
  async getLandingPageSettings(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const settings = await landingPageSettingsService.getLandingPageSettings();
      res.status(200).json(settings);
    } catch (error) {
      next(error);
    }
  }

  async updateLandingPageSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const settings = await landingPageSettingsService.updateLandingPageSettings(req.body);
      res.status(200).json({ message: 'Landing page settings updated successfully', settings });
    } catch (error) {
      next(error);
    }
  }
}
