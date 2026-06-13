import { Request, Response } from 'express';
import productService from '../services/product.service';
import { streamProductsExportZip } from '../services/productExport.service';
import { logger } from '../utils/logger';
import { validateRequest, parseIntParam, parseOptionalIntQuery } from '../utils/request.util';

export class ProductController {
  async getAllProducts(req: Request, res: Response) : Promise<void> {
    const limit = parseOptionalIntQuery(req.query.limit as string | undefined);
    const offset = parseOptionalIntQuery(req.query.offset as string | undefined);
    const products = await productService.getAllProducts(req.user?.roles, limit, offset);
    res.status(200).json(products);
  }

  async getProductById(req: Request, res: Response) : Promise<void> {
    const id = parseIntParam(req.params.id, res, 'product');
    if (id === null) return;
    const product = await productService.getProductById(id, req.user?.roles);
    res.status(200).json(product);
  }

  async createProduct(req: Request, res: Response) : Promise<void> {
    if (!validateRequest(req, res)) return;
    logger.info('Product create requested', {
      requestId: req.requestId || 'unknown',
      actorUserId: req.user?.userId || 'anonymous',
      name: req.body.name,
      categoryId: req.body.categoryId,
    });
    const product = await productService.createProduct(req.body);
    res.status(201).json({ message: 'Product created successfully', product });
  }

  async updateProduct(req: Request, res: Response) : Promise<void> {
    const id = parseIntParam(req.params.id, res, 'product');
    if (id === null) return;
    if (!validateRequest(req, res)) return;
    logger.info('Product update requested', {
      requestId: req.requestId || 'unknown',
      actorUserId: req.user?.userId || 'anonymous',
      targetProductId: id,
      fields: Object.keys(req.body || {}),
    });
    const product = await productService.updateProduct(id, req.body);
    res.status(200).json({ message: 'Product updated successfully', product });
  }

  async exportZip(_req: Request, res: Response) : Promise<void> {
    await streamProductsExportZip(res);
  }

  async deleteProduct(req: Request, res: Response) : Promise<void> {
    const id = parseIntParam(req.params.id, res, 'product');
    if (id === null) return;
    logger.info('Product delete requested', {
      requestId: req.requestId || 'unknown',
      actorUserId: req.user?.userId || 'anonymous',
      targetProductId: id,
    });
    const result = await productService.deleteProduct(id);
    res.status(200).json(result);
  }
}

export default new ProductController();
