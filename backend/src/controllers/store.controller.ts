import { Request, Response } from 'express';
import { StoreService } from '../services/store.service';
import { successResponse } from '../utils/responseEnvelope';
import { AppError } from '../middleware/error.middleware';

const storeService = new StoreService();

export class StoreController {
  // GET /
  async list(_req: Request, res: Response): Promise<void> {
    const stores = await storeService.listStores();
    res.status(200).json(successResponse(stores));
  }

  // POST /
  async create(req: Request, res: Response): Promise<void> {
    const { name, slug } = req.body as { name?: unknown; slug?: unknown };
    if (typeof name !== 'string' || !name.trim()) {
      throw new AppError('name is required', 400);
    }
    if (typeof slug !== 'string' || !slug.trim()) {
      throw new AppError('slug is required', 400);
    }
    const store = await storeService.createStore({ name: name.trim(), slug: slug.trim() });
    res.status(201).json(successResponse(store));
  }

  // PATCH /:id
  async update(req: Request, res: Response): Promise<void> {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new AppError('Invalid store id', 400);

    const { name, slug, status } = req.body as {
      name?: unknown;
      slug?: unknown;
      status?: unknown;
    };

    const patch: { name?: string; slug?: string; status?: string } = {};
    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) throw new AppError('name must be a non-empty string', 400);
      patch.name = name.trim();
    }
    if (slug !== undefined) {
      if (typeof slug !== 'string' || !slug.trim()) throw new AppError('slug must be a non-empty string', 400);
      patch.slug = slug.trim();
    }
    if (status !== undefined) {
      if (status !== 'ACTIVE' && status !== 'SUSPENDED') {
        throw new AppError('status must be ACTIVE or SUSPENDED', 400);
      }
      patch.status = status as string;
    }

    const store = await storeService.updateStore(id, patch);
    res.status(200).json(successResponse(store));
  }

  // PATCH /:id/default
  async setDefault(req: Request, res: Response): Promise<void> {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new AppError('Invalid store id', 400);

    const store = await storeService.setDefaultStore(id);
    res.status(200).json(successResponse(store));
  }

  // POST /:id/clone-from-default
  async cloneFromDefault(req: Request, res: Response): Promise<void> {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new AppError('Invalid store id', 400);

    const result = await storeService.cloneFromDefault(id);
    res.status(200).json(successResponse(result));
  }
}
