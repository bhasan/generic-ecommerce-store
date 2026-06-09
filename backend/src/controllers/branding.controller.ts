import { Request, Response, NextFunction } from 'express';
import { BrandingService } from '../services/branding.service';

const brandingService = new BrandingService();

export class BrandingController {
  async getBranding(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const branding = await brandingService.getBranding();
      res.status(200).json(branding);
    } catch (error) {
      next(error);
    }
  }

  async updateBranding(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const branding = await brandingService.updateBranding(req.body);
      res.status(200).json({ message: 'Branding updated successfully', branding });
    } catch (error) {
      next(error);
    }
  }

  async getCss(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const css = await brandingService.generateCssBlock();
      res.setHeader('Content-Type', 'text/css');
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).send(css);
    } catch (error) {
      next(error);
    }
  }
}

export const brandingController = new BrandingController();
