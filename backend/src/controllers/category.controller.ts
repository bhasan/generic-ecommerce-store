import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import categoryService from '../services/category.service';
import { logger } from '../utils/logger';

export class CategoryController {
  async getAllCategories(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const categories = await categoryService.getAllCategories();
      res.status(200).json(categories);
    } catch (error) {
      next(error);
    }
  }

  async createCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.warn('Category create validation failed', {
          requestId: req.requestId || 'unknown',
          actorUserId: req.user?.userId || 'anonymous',
          errors: errors.array(),
        });
        res.status(400).json({ errors: errors.array() });
        return;
      }

      logger.info('Category create requested', {
        requestId: req.requestId || 'unknown',
        actorUserId: req.user?.userId || 'anonymous',
        name: req.body.name,
        parentId: req.body.parentId ?? null,
      });
      const category = await categoryService.createCategory(req.body);
      res.status(201).json({
        message: 'Category created successfully',
        category
      });
    } catch (error) {
      next(error);
    }
  }

  async updateCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid category ID' });
        return;
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.warn('Category update validation failed', {
          requestId: req.requestId || 'unknown',
          actorUserId: req.user?.userId || 'anonymous',
          targetCategoryId: id,
          errors: errors.array(),
        });
        res.status(400).json({ errors: errors.array() });
        return;
      }

      logger.info('Category update requested', {
        requestId: req.requestId || 'unknown',
        actorUserId: req.user?.userId || 'anonymous',
        targetCategoryId: id,
        fields: Object.keys(req.body || {}),
      });
      const category = await categoryService.updateCategory(id, req.body);
      res.status(200).json({
        message: 'Category updated successfully',
        category
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid category ID' });
        return;
      }

      logger.info('Category delete requested', {
        requestId: req.requestId || 'unknown',
        actorUserId: req.user?.userId || 'anonymous',
        targetCategoryId: id,
      });
      const result = await categoryService.deleteCategory(id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
}

export default new CategoryController();
