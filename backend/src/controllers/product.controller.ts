import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import productService from '../services/product.service';

export class ProductController {
  /**
   * Get all products
   * GET /api/products
   */
  async getAllProducts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const products = await productService.getAllProducts(req.user?.role);
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

      const product = await productService.getProductById(id, req.user?.role);
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
        res.status(400).json({ errors: errors.array() });
        return;
      }

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
        res.status(400).json({ errors: errors.array() });
        return;
      }

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

      const result = await productService.deleteProduct(id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
}

export default new ProductController();
