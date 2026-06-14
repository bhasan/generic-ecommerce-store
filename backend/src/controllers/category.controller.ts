import { Request, Response } from 'express';
import categoryService from '../services/category.service';
import { logger } from '../utils/logger';
import { validateRequest, parseIntParam } from '../utils/request.util';

export class CategoryController {
  async getAllCategories(_req: Request, res: Response) : Promise<void> {
    const categories = await categoryService.getAllCategories();
    res.status(200).json(categories);
  }

  async createCategory(req: Request, res: Response) : Promise<void> {
    if (!validateRequest(req, res)) return;
    logger.info('Category create requested', {
      requestId: req.requestId || 'unknown',
      actorUserId: req.user?.userId || 'anonymous',
      name: req.body.name,
      parentId: req.body.parentId ?? null,
    });
    const category = await categoryService.createCategory(req.body);
    res.status(201).json({ message: 'Category created successfully', category });
  }

  async updateCategory(req: Request, res: Response) : Promise<void> {
    const id = parseIntParam(req.params.id, res, 'category');
    if (id === null) return;
    if (!validateRequest(req, res)) return;
    logger.info('Category update requested', {
      requestId: req.requestId || 'unknown',
      actorUserId: req.user?.userId || 'anonymous',
      targetCategoryId: id,
      fields: Object.keys(req.body || {}),
    });
    const category = await categoryService.updateCategory(id, req.body);
    res.status(200).json({ message: 'Category updated successfully', category });
  }

  async deleteCategory(req: Request, res: Response) : Promise<void> {
    const id = parseIntParam(req.params.id, res, 'category');
    if (id === null) return;
    logger.info('Category delete requested', {
      requestId: req.requestId || 'unknown',
      actorUserId: req.user?.userId || 'anonymous',
      targetCategoryId: id,
    });
    const result = await categoryService.deleteCategory(id);
    res.status(200).json(result);
  }
}

export default new CategoryController();
