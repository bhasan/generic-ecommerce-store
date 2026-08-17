import { Request, Response } from 'express';
import { createHash } from 'crypto';
import { BrandingService } from '../services/branding.service';
import { successResponse } from '../utils/responseEnvelope';

const brandingService = new BrandingService();

export class BrandingController {
  async getBranding(_req: Request, res: Response) : Promise<void> {
    const branding = await brandingService.getBranding();
    res.status(200).json(successResponse(branding));
  }

  async updateBranding(req: Request, res: Response) : Promise<void> {
    const branding = await brandingService.updateBranding(req.body);
    res.status(200).json(successResponse({ branding }, 'Branding updated successfully'));
  }

  // Public, unauthenticated: ONLY the brand-identity fields the login/register
  // page needs to theme itself (name, logo, favicon, colors). Deliberately a
  // curated subset — store address, payment handles, catalog, etc. are NOT here
  // and stay behind authentication.
  async getPublicBranding(_req: Request, res: Response) : Promise<void> {
    const b = await brandingService.getBranding();
    res.status(200).json(successResponse({
      storeName: b.storeName,
      logoUrl: b.logoUrl,
      faviconUrls: b.faviconUrls,
      palette: b.palette,
      customColors: b.customColors,
    }));
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
