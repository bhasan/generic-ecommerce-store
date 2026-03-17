import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { AppError } from '../middleware/error.middleware';

interface MulterRequest extends Request {
  file?: any;
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

      const url = `/api/uploads/${req.file.filename}`;
      res.status(201).json({ url });
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
