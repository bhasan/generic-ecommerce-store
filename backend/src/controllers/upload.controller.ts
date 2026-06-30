import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import unzipper from 'unzipper';
import { AppError } from '../middleware/error.middleware';
import { UPLOADS_DIR, tenantUploadsDir } from '../utils/fileUtils';
import { getTenantContextOrThrow } from '../config/tenantContext';
import { BrandingService } from '../services/branding.service';
import { processUploadedImage, processFaviconUpload } from '../services/imageProcessing.service';
import { successResponse } from '../utils/responseEnvelope';

interface MulterRequest extends Request {
  file?: Express.Multer.File;
  files?: Express.Multer.File[] | { [fieldname: string]: Express.Multer.File[] };
}

export class UploadController {
  async uploadImage(req: MulterRequest, res: Response): Promise<void> {
    if (!req.file) {
      throw new AppError('No file uploaded. Please select an image.', 400);
    }
    const { tenantId } = getTenantContextOrThrow();
    const filename = await processUploadedImage(req.file as any);
    res.status(201).json(successResponse({ url: `/api/uploads/tenants/${tenantId}/${filename}` }));
  }

  async uploadImages(req: MulterRequest, res: Response): Promise<void> {
    if (!req.files || req.files.length === 0) {
      throw new AppError('No files uploaded. Please select at least one image.', 400);
    }
    const { tenantId } = getTenantContextOrThrow();
    const filenames = await Promise.all((req.files as any[]).map(processUploadedImage));
    const urls = filenames.map((filename) => `/api/uploads/tenants/${tenantId}/${filename}`);
    res.status(201).json(successResponse({ urls }));
  }

  async getImages(_req: Request, res: Response): Promise<void> {
    const { tenantId } = getTenantContextOrThrow();
    const dir = tenantUploadsDir(tenantId); // created on demand; safe if empty
    const files = await fs.promises.readdir(dir);
    const statResults = await Promise.all(
      files.map(async (file) => {
        const filePath = path.join(dir, file);
        const stats = await fs.promises.stat(filePath);
        return stats.isFile()
          ? { url: `/api/uploads/tenants/${tenantId}/${file}`, filename: file, size: stats.size, createdAt: stats.birthtime }
          : null;
      }),
    );
    const images = statResults.filter((x): x is NonNullable<typeof x> => x !== null);
    images.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    res.status(200).json(successResponse({ images }));
  }

  async importZip(req: Request, res: Response) : Promise<void> {
    if (!req.file) {
      throw new AppError('No ZIP file provided', 400, 'VALIDATION_ERROR');
    }

    const directory = await unzipper.Open.buffer(req.file.buffer);
    let imported = 0;
    let skipped = 0;

    for (const entry of directory.files) {
      if (!entry.path.startsWith('images/') || entry.type !== 'File') continue;

      const filename = entry.path.slice('images/'.length);
      if (!filename) continue;

      // Prevent directory traversal
      const safeFilename = path.basename(filename);
      const dest = path.join(UPLOADS_DIR, safeFilename);

      try {
        await fs.promises.access(dest);
        skipped++;
        continue;
      } catch {
        // File doesn't exist — write it
      }

      const content = await entry.buffer();
      await fs.promises.writeFile(dest, content);
      imported++;
    }

    res.json(successResponse({ imported, skipped }));
  }

  async uploadFavicon(req: MulterRequest, res: Response) : Promise<void> {
    if (!req.file) {
      throw new AppError('No file uploaded. Please select an image.', 400);
    }
    const faviconUrls = await processFaviconUpload(req.file, Date.now());
    const brandingService = new BrandingService();
    await brandingService.updateBranding({ faviconUrls });
    res.status(201).json(successResponse({ urls: faviconUrls }));
  }

  async deleteImage(req: Request, res: Response) : Promise<void> {
    const { filename } = req.params;

    if (!filename) {
      throw new AppError('Filename is required.', 400);
    }

    // Prevent directory traversal
    const safeFilename = path.basename(filename);
    const filePath = path.join(UPLOADS_DIR, safeFilename);

    if (!fs.existsSync(filePath)) {
      throw new AppError('Image not found.', 404);
    }

    await fs.promises.unlink(filePath);
    res.status(200).json(successResponse(null, 'Image deleted successfully'));
  }
}

export default new UploadController();
