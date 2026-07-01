import { Router } from 'express';
import { StoreController } from '../controllers/store.controller';
import { authenticate } from '../middleware/auth.middleware';
import { asyncHandler } from '../utils/asyncHandler.util';

const router = Router();
const storeController = new StoreController();

// Authenticated: the store list is used by the in-app picker/switcher.
router.get('/', authenticate, asyncHandler(storeController.list));

export default router;
