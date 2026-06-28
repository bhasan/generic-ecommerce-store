import { Request, Response } from 'express';
import { LandingPageSettingsService } from '../services/landingPageSettings.service';
import { successResponse } from '../utils/responseEnvelope';

const landingPageSettingsService = new LandingPageSettingsService();

export class LandingPageSettingsController {
  async getLandingPageSettings(_req: Request, res: Response) : Promise<void> {
    const settings = await landingPageSettingsService.getLandingPageSettings();
    res.status(200).json(successResponse(settings));
  }

  async updateLandingPageSettings(req: Request, res: Response) : Promise<void> {
    const settings = await landingPageSettingsService.updateLandingPageSettings(req.body);
    res.status(200).json(successResponse({ settings }, 'Landing page settings updated successfully'));
  }
}
