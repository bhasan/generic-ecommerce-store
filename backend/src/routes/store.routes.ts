import { Router } from 'express';
import { StoreController } from '../controllers/store.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorizeAdmin } from '../middleware/role.middleware';
import { asyncHandler } from '../utils/asyncHandler.util';

const router = Router();
const storeController = new StoreController();

// Authenticated: the store list is used by the in-app picker/switcher.
router.get('/', authenticate, asyncHandler(storeController.list));

// Admin-only: all stores (including SUSPENDED) for the tenant-admin management screen.
router.get('/manage', authenticate, authorizeAdmin, asyncHandler(storeController.listAll));

// Admin-only store management endpoints.
router.post('/', authenticate, authorizeAdmin, asyncHandler(storeController.create));
router.patch('/:id', authenticate, authorizeAdmin, asyncHandler(storeController.update));
router.patch('/:id/default', authenticate, authorizeAdmin, asyncHandler(storeController.setDefault));
router.post('/:id/clone-from-default', authenticate, authorizeAdmin, asyncHandler(storeController.cloneFromDefault));

export default router;
