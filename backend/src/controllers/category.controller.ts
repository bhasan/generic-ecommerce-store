import { Request, Response } from 'express';
import categoryService from '../services/category.service';
import { validateRequest } from '../utils/request.util';
import { logAuditEvent } from '../utils/auditLog.util';

export class CategoryController {
  async getAllCategories(_req: Request, res: Response) : Promise<void> {
    const categories = await categoryService.getAllCategories();
    res.status(200).json(categories);
  }

  async createCategory(req: Request, res: Response) : Promise<void> {
    if (!validateRequest(req, res)) return;
    logAuditEvent(req, 'Category create requested', {
      name: req.body.name,
      parentId: req.body.parentId ?? null,
    });
    const category = await categoryService.createCategory(req.body);
    res.status(201).json({ message: 'Category created successfully', category });
  }

  async updateCategory(req: Request, res: Response) : Promise<void> {
    const id = parseInt(req.params.id, 10);
    if (!validateRequest(req, res)) return;
    logAuditEvent(req, 'Category update requested', {
      targetCategoryId: id,
      fields: Object.keys(req.body || {}),
    });
    const category = await categoryService.updateCategory(id, req.body);
    res.status(200).json({ message: 'Category updated successfully', category });
  }

  async deleteCategory(req: Request, res: Response) : Promise<void> {
    const id = parseInt(req.params.id, 10);
    logAuditEvent(req, 'Category delete requested', {
      targetCategoryId: id,
    });
    const result = await categoryService.deleteCategory(id);
    res.status(200).json(result);
  }
}

export default new CategoryController();
