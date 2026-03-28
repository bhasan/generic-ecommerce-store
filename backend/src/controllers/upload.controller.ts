import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { AppError } from '../middleware/error.middleware';

const MAX_IMAGE_DIMENSION = 1920;
const WEBP_QUALITY = 85;

const isVideoMime = (mime: string) => mime.startsWith('video/');

/**
 * Process an uploaded image file with Sharp: resize to max 1920px and convert to WebP.
 * Returns the new filename. The original file is deleted.
 */
async function processImage(file: any): Promise<string> {
  if (isVideoMime(file.mimetype)) return file.filename;

  const uploadsDir = path.join(process.cwd(), 'uploads');
  const inputPath = path.join(uploadsDir, file.filename);
  const webpFilename = file.filename.replace(/\.[^.]+$/, '.webp');
  const outputPath = path.join(uploadsDir, webpFilename);

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
  /**
   * Upload a single image file
   * POST /api/upload
   */
  async uploadImage(req: MulterRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.file) {
        throw new AppError('No file uploaded. Please select an image.', 400);
      }

      const filename = await processImage(req.file);
      const url = `/api/uploads/${filename}`;
      res.status(201).json({ url });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Upload multiple image files
   * POST /api/upload/multiple
   */
  async uploadImages(req: MulterRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.files || req.files.length === 0) {
        throw new AppError('No files uploaded. Please select at least one image.', 400);
      }

      const filenames = await Promise.all((req.files as any[]).map((file) => processImage(file)));
      const urls = filenames.map((filename) => `/api/uploads/${filename}`);
      res.status(201).json({ urls });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get list of uploaded images
   * GET /api/upload
   */
  async getImages(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const uploadsDir = path.join(process.cwd(), 'uploads');
      
      if (!fs.existsSync(uploadsDir)) {
        res.status(200).json({ images: [] });
        return;
      }

      const files = await fs.promises.readdir(uploadsDir);
      const images = [];

      for (const file of files) {
        const filePath = path.join(uploadsDir, file);
        const stats = await fs.promises.stat(filePath);
        
        // Only return files, not directories
        if (stats.isFile()) {
           images.push({
             url: `/api/uploads/${file}`,
             filename: file,
             size: stats.size,
             createdAt: stats.birthtime, // Use birthtime or mtime
           });
        }
      }

      // Sort images by creation date (newest first)
      images.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      res.status(200).json({ images });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete an uploaded image
   * DELETE /api/upload/:filename
   */
  async deleteImage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { filename } = req.params;
      
      if (!filename) {
        throw new AppError('Filename is required.', 400);
      }

      // Prevent directory traversal
      const safeFilename = path.basename(filename);
      const uploadsDir = path.join(process.cwd(), 'uploads');
      const filePath = path.join(uploadsDir, safeFilename);

      if (!fs.existsSync(filePath)) {
        throw new AppError('Image not found.', 404);
      }

      await fs.promises.unlink(filePath);

      res.status(200).json({ message: 'Image deleted successfully' });
    } catch (error) {
      next(error);
    }
  }
}

export default new UploadController();
