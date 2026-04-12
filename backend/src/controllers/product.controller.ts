import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import productService from '../services/product.service';
import { streamProductsExportZip } from '../services/productExport.service';
import { logger } from '../utils/logger';

export class ProductController {
  /**
   * Get all products
   * GET /api/products
   */
  async getAllProducts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const limit = req.query.limit !== undefined ? parseInt(req.query.limit as string, 10) : undefined;
      const offset = req.query.offset !== undefined ? parseInt(req.query.offset as string, 10) : undefined;
      const products = await productService.getAllProducts(req.user?.roles, limit, offset);
      res.status(200).json(products);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get product by ID
   * GET /api/products/:id
   */
  async getProductById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid product ID' });
        return;
      }

      const product = await productService.getProductById(id, req.user?.roles);
      res.status(200).json(product);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create product
   * POST /api/products
   */
  async createProduct(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.warn('Product create validation failed', {
          requestId: req.requestId || 'unknown',
          actorUserId: req.user?.userId || 'anonymous',
          errors: errors.array(),
        });
        res.status(400).json({ errors: errors.array() });
        return;
      }

      logger.info('Product create requested', {
        requestId: req.requestId || 'unknown',
        actorUserId: req.user?.userId || 'anonymous',
        name: req.body.name,
        categoryId: req.body.categoryId,
      });
      const product = await productService.createProduct(req.body);
      res.status(201).json({
        message: 'Product created successfully',
        product
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update product
   * PUT /api/products/:id
   */
  async updateProduct(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid product ID' });
        return;
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.warn('Product update validation failed', {
          requestId: req.requestId || 'unknown',
          actorUserId: req.user?.userId || 'anonymous',
          targetProductId: id,
          errors: errors.array(),
        });
        res.status(400).json({ errors: errors.array() });
        return;
      }

      logger.info('Product update requested', {
        requestId: req.requestId || 'unknown',
        actorUserId: req.user?.userId || 'anonymous',
        targetProductId: id,
        fields: Object.keys(req.body || {}),
      });
      const product = await productService.updateProduct(id, req.body);
      res.status(200).json({
        message: 'Product updated successfully',
        product
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Export all products + images as a ZIP archive
   * GET /api/products/export-zip
   */
  async exportZip(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await streamProductsExportZip(res);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete product
   * DELETE /api/products/:id
   */
  async deleteProduct(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid product ID' });
        return;
      }

      logger.info('Product delete requested', {
        requestId: req.requestId || 'unknown',
        actorUserId: req.user?.userId || 'anonymous',
        targetProductId: id,
      });
      const result = await productService.deleteProduct(id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
}

export default new ProductController();
