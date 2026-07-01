import { Request, Response } from 'express';
import productService from '../services/product.service';
import { streamProductsExportZip } from '../services/productExport.service';
import { validateRequest, parsePaginationQuery } from '../utils/request.util';
import { logAuditEvent } from '../utils/auditLog.util';
import { successResponse } from '../utils/responseEnvelope';
import { hasAnyRole } from '../constants/roles';

/**
 * Resolve whether this read should use BASE (canonical, un-overridden) catalog
 * values instead of per-store effective ones. Honored only for the base-catalog
 * management editor: gated to ADMIN/MANAGEMENT so a customer can't request base
 * pricing via `?scope=base` and bypass per-store effective price/stock.
 */
const wantsBaseScope = (req: Request): boolean =>
  req.query.scope === 'base' && hasAnyRole(req.user?.roles, ['ADMIN', 'MANAGEMENT']);

export class ProductController {
  async getAllProducts(req: Request, res: Response) : Promise<void> {
    const { limit, offset } = parsePaginationQuery(
      req.query as { limit?: string; offset?: string },
      { defaultLimit: 500, maxLimit: 1000 }, // catalog browse stays generous; pathological growth capped
    );
    const products = await productService.getAllProducts(req.user?.roles, limit, offset, {
      base: wantsBaseScope(req),
    });
    res.status(200).json(successResponse(products));
  }

  async searchProducts(req: Request, res: Response): Promise<void> {
    const q = (req.query.q as string) ?? '';
    const { limit, offset } = parsePaginationQuery(
      req.query as { limit?: string; offset?: string },
      { defaultLimit: 50, maxLimit: 200 },
    );
    const products = await productService.searchProducts(req.user?.roles, q, { limit, offset }, {
      base: wantsBaseScope(req),
    });
    res.status(200).json(successResponse(products));
  }

  async getProductById(req: Request, res: Response) : Promise<void> {
    const id = parseInt(req.params.id, 10);
    const product = await productService.getProductById(id, req.user?.roles, {
      base: wantsBaseScope(req),
    });
    res.status(200).json(successResponse(product));
  }

  async createProduct(req: Request, res: Response) : Promise<void> {
    if (!validateRequest(req, res)) return;
    logAuditEvent(req, 'Product create requested', {
      name: req.body.name,
      categoryId: req.body.categoryId,
    });
    const product = await productService.createProduct(req.body);
    res.status(201).json(successResponse({ product }, 'Product created successfully'));
  }

  async updateProduct(req: Request, res: Response) : Promise<void> {
    const id = parseInt(req.params.id, 10);
    if (!validateRequest(req, res)) return;
    logAuditEvent(req, 'Product update requested', {
      targetProductId: id,
      fields: Object.keys(req.body || {}),
    });
    const product = await productService.updateProduct(id, req.body);
    res.status(200).json(successResponse({ product }, 'Product updated successfully'));
  }

  async exportZip(_req: Request, res: Response) : Promise<void> {
    await streamProductsExportZip(res);
  }

  async deleteProduct(req: Request, res: Response) : Promise<void> {
    const id = parseInt(req.params.id, 10);
    logAuditEvent(req, 'Product delete requested', {
      targetProductId: id,
    });
    const result = await productService.deleteProduct(id);
    res.status(200).json(successResponse(result));
  }
}

export default new ProductController();
