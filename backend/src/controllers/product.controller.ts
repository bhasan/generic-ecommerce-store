import { Request, Response } from 'express';
import productService from '../services/product.service';
import { streamProductsExportZip } from '../services/productExport.service';
import { logger } from '../utils/logger';
import { validateRequest, parseIntParam, parsePaginationQuery } from '../utils/request.util';
import { logAuditEvent } from '../utils/auditLog.util';

export class ProductController {
  async getAllProducts(req: Request, res: Response) : Promise<void> {
    const { limit, offset } = parsePaginationQuery(
      req.query as { limit?: string; offset?: string },
      { defaultLimit: 500, maxLimit: 1000 }, // catalog browse stays generous; pathological growth capped
    );
    const products = await productService.getAllProducts(req.user?.roles, limit, offset);
    res.status(200).json(products);
  }

  async searchProducts(req: Request, res: Response): Promise<void> {
    const q = (req.query.q as string) ?? '';
    const { limit, offset } = parsePaginationQuery(
      req.query as { limit?: string; offset?: string },
      { defaultLimit: 50, maxLimit: 200 },
    );
    const products = await productService.searchProducts(req.user?.roles, q, { limit, offset });
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
    logAuditEvent(req, 'Product create requested', {
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
    logAuditEvent(req, 'Product update requested', {
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
    logAuditEvent(req, 'Product delete requested', {
      targetProductId: id,
    });
    const result = await productService.deleteProduct(id);
    res.status(200).json(result);
  }
}

export default new ProductController();
