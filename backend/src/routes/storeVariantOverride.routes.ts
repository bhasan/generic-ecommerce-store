// backend/src/routes/storeVariantOverride.routes.ts
//
// Per-store inventory/pricing override routes — admin-only.
//
// GET  /api/store-overrides?storeId=<id>          → list overrides + base variants
// PUT  /api/store-overrides                        → upsert an override (body)
// DELETE /api/store-overrides?storeId=&variantId= → remove an override (revert to base)

import { Router } from 'express';
import { StoreVariantOverrideController } from '../controllers/storeVariantOverride.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorizeAdmin } from '../middleware/role.middleware';
import { asyncHandler } from '../utils/asyncHandler.util';

const router = Router();
const ctrl = new StoreVariantOverrideController();

router.get('/', authenticate, authorizeAdmin, asyncHandler(ctrl.list));
router.put('/', authenticate, authorizeAdmin, asyncHandler(ctrl.upsert));
router.delete('/', authenticate, authorizeAdmin, asyncHandler(ctrl.remove));

export default router;
