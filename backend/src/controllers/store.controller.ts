import { Request, Response } from 'express';
import { StoreService } from '../services/store.service';
import { successResponse } from '../utils/responseEnvelope';

const storeService = new StoreService();

export class StoreController {
  async list(_req: Request, res: Response): Promise<void> {
    const stores = await storeService.listStores();
    res.status(200).json(successResponse(stores));
  }
}
