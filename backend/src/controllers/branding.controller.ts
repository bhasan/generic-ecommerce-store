import { Request, Response } from 'express';
import { createHash } from 'crypto';
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

  async getCss(req: Request, res: Response) : Promise<void> {
    const css = await brandingService.generateCssBlock();
    const etag = `"${createHash('sha1').update(css).digest('hex')}"`;

    res.setHeader('Content-Type', 'text/css');
    res.setHeader('Cache-Control', 'public, max-age=60, must-revalidate');
    res.setHeader('ETag', etag);

    if (req.headers['if-none-match'] === etag) {
      res.status(304).end();
      return;
    }
    res.status(200).send(css);
  }
}

export const brandingController = new BrandingController();
