import { Request, Response, NextFunction } from 'express';
import { AppError } from '../middleware/error.middleware';

export class UploadController {
  /**
   * Upload a single image file
   * POST /api/upload
   */
  async uploadImage(req: Request, res: Response, next: NextFunction): Promise<void> {
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
}

export default new UploadController();
