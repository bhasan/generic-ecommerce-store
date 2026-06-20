import { Request, Response } from 'express';
import { BrandingService } from '../services/branding.service';

const brandingService = new BrandingService();

export class BrandingController {
  async getBranding(_req: Request, res: Response) : Promise<void> {
    const branding = await brandingService.getBranding();
    res.status(200).json(branding);
  }

  async updateBranding(req: Request, res: Response) : Promise<void> {
    const branding = await brandingService.updateBranding(req.body);
    res.status(200).json({ message: 'Branding updated successfully', branding });
  }

  async getCss(_req: Request, res: Response) : Promise<void> {
    const css = await brandingService.generateCssBlock();
    res.setHeader('Content-Type', 'text/css');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(css);
  }
}

export const brandingController = new BrandingController();
