import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import unzipper from 'unzipper';
import { AppError } from '../middleware/error.middleware';
import { UPLOADS_DIR } from '../utils/fileUtils';
import { BrandingService } from '../services/branding.service';

const MAX_IMAGE_DIMENSION = 1920;
const WEBP_QUALITY = 85;

const isVideoMime = (mime: string) => mime.startsWith('video/');

/**
 * Process an uploaded image file with Sharp: resize to max 1920px and convert to WebP.
 * Returns the new filename. The original file is deleted.
 */
async function processImage(file: any): Promise<string> {
  if (isVideoMime(file.mimetype)) return file.filename;

  const inputPath = path.join(UPLOADS_DIR, file.filename);
  const webpFilename = file.filename.replace(/\.[^.]+$/, '.webp');
  const outputPath = path.join(UPLOADS_DIR, webpFilename);

  await sharp(inputPath)
    .resize(MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toFile(outputPath);

  await fs.promises.unlink(inputPath);
  return webpFilename;
}

interface MulterRequest extends Request {
  file?: Express.Multer.File;
  files?: Express.Multer.File[] | { [fieldname: string]: Express.Multer.File[] };
}

export class UploadController {
  async uploadImage(req: MulterRequest, res: Response) : Promise<void> {
    if (!req.file) {
      throw new AppError('No file uploaded. Please select an image.', 400);
    }
    const filename = await processImage(req.file);
    res.status(201).json({ url: `/api/uploads/${filename}` });
  }

  async uploadImages(req: MulterRequest, res: Response) : Promise<void> {
    if (!req.files || req.files.length === 0) {
      throw new AppError('No files uploaded. Please select at least one image.', 400);
    }
    const filenames = await Promise.all((req.files as any[]).map((file) => processImage(file)));
    const urls = filenames.map((filename) => `/api/uploads/${filename}`);
    res.status(201).json({ urls });
  }

  async getImages(_req: Request, res: Response) : Promise<void> {
    if (!fs.existsSync(UPLOADS_DIR)) {
      res.status(200).json({ images: [] });
      return;
    }

    const files = await fs.promises.readdir(UPLOADS_DIR);
    const statResults = await Promise.all(
      files.map(async (file) => {
        const filePath = path.join(UPLOADS_DIR, file);
        const stats = await fs.promises.stat(filePath);
        return stats.isFile() ? { url: `/api/uploads/${file}`, filename: file, size: stats.size, createdAt: stats.birthtime } : null;
      })
    );
    const images = statResults.filter((x): x is NonNullable<typeof x> => x !== null);
    images.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    res.status(200).json({ images });
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

    res.json({ imported, skipped });
  }

  async uploadFavicon(req: MulterRequest, res: Response) : Promise<void> {
    if (!req.file) {
      throw new AppError('No file uploaded. Please select an image.', 400);
    }
    const sizes: Array<{ key: '16' | '32' | '180'; size: number }> = [
      { key: '16', size: 16 },
      { key: '32', size: 32 },
      { key: '180', size: 180 },
    ];
    const inputPath = path.join(UPLOADS_DIR, req.file.filename);
    const faviconUrls: { '16': string; '32': string; '180': string } = { '16': '', '32': '', '180': '' };

    const version = Date.now();
    await Promise.all(sizes.map(async ({ key, size }) => {
      const outFilename = `favicon-${size}.png`;
      const outPath = path.join(UPLOADS_DIR, outFilename);
      await sharp(inputPath).resize(size, size, { fit: 'cover' }).png().toFile(outPath);
      faviconUrls[key] = `/api/uploads/${outFilename}?v=${version}`;
    }));

    await fs.promises.unlink(inputPath);
    const brandingService = new BrandingService();
    await brandingService.updateBranding({ faviconUrls });
    res.status(201).json({ urls: faviconUrls });
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
    res.status(200).json({ message: 'Image deleted successfully' });
  }
}

export default new UploadController();
