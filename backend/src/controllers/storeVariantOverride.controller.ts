// backend/src/controllers/storeVariantOverride.controller.ts
//
// HTTP handlers for per-store inventory/pricing override endpoints.
// Parses storeId/variantId from query params (GET, DELETE) or body (PUT).

import { Request, Response } from 'express';
import { StoreVariantOverrideService } from '../services/storeVariantOverride.service';
import { successResponse } from '../utils/responseEnvelope';
import { AppError } from '../middleware/error.middleware';

const svc = new StoreVariantOverrideService();

export class StoreVariantOverrideController {
  // GET /?storeId=<id>
  // Returns overrides for the store plus all tenant base variants.
  async list(req: Request, res: Response): Promise<void> {
    const rawStoreId = req.query.storeId;
    if (rawStoreId === undefined || rawStoreId === '') {
      throw new AppError('storeId query parameter is required', 400);
    }
    const storeId = parseInt(String(rawStoreId), 10);
    if (isNaN(storeId)) {
      throw new AppError('storeId must be a numeric value', 400);
    }

    const result = await svc.listForStore(storeId);
    res.status(200).json(successResponse(result));
  }

  // PUT /
  // Body: { storeId, variantId, stock?, priceOverride?, activeOverride? }
  async upsert(req: Request, res: Response): Promise<void> {
    const body = req.body as {
      storeId?: unknown;
      variantId?: unknown;
      stock?: unknown;
      priceOverride?: unknown;
      activeOverride?: unknown;
    };

    const storeIdRaw = body.storeId;
    const variantIdRaw = body.variantId;

    if (storeIdRaw === undefined || storeIdRaw === null) {
      throw new AppError('storeId is required', 400);
    }
    if (variantIdRaw === undefined || variantIdRaw === null) {
      throw new AppError('variantId is required', 400);
    }

    const storeId = Number(storeIdRaw);
    const variantId = Number(variantIdRaw);

    if (!Number.isInteger(storeId) || isNaN(storeId)) {
      throw new AppError('storeId must be a numeric value', 400);
    }
    if (!Number.isInteger(variantId) || isNaN(variantId) || variantId <= 0) {
      throw new AppError('variantId must be a positive integer', 400);
    }

    const input: Parameters<typeof svc.upsertOverride>[0] = { storeId, variantId };

    if (body.stock !== undefined) {
      const s = Number(body.stock);
      if (isNaN(s)) throw new AppError('stock must be numeric', 400);
      input.stock = s;
    }
    if (body.priceOverride !== undefined) {
      if (body.priceOverride === null) {
        input.priceOverride = null;
      } else {
        const p = Number(body.priceOverride);
        if (isNaN(p)) throw new AppError('priceOverride must be numeric', 400);
        input.priceOverride = p;
      }
    }
    if (body.activeOverride !== undefined) {
      if (typeof body.activeOverride !== 'boolean' && body.activeOverride !== null) {
        throw new AppError('activeOverride must be a boolean or null', 400);
      }
      input.activeOverride = body.activeOverride as boolean | null;
    }

    const override = await svc.upsertOverride(input);
    res.status(200).json(successResponse(override));
  }

  // DELETE /?storeId=<id>&variantId=<id>
  async remove(req: Request, res: Response): Promise<void> {
    const rawStoreId = req.query.storeId;
    const rawVariantId = req.query.variantId;

    if (rawStoreId === undefined || rawStoreId === '') {
      throw new AppError('storeId query parameter is required', 400);
    }
    if (rawVariantId === undefined || rawVariantId === '') {
      throw new AppError('variantId query parameter is required', 400);
    }

    const storeId = parseInt(String(rawStoreId), 10);
    const variantId = parseInt(String(rawVariantId), 10);

    if (isNaN(storeId)) throw new AppError('storeId must be a numeric value', 400);
    if (isNaN(variantId)) throw new AppError('variantId must be a numeric value', 400);

    const result = await svc.deleteOverride(storeId, variantId);
    res.status(200).json(successResponse(result));
  }
}
