import { Router } from 'express';
import { StoreSettingsController } from '../controllers/storeSettings.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorizeAdmin } from '../middleware/role.middleware';
import { asyncHandler } from '../utils/asyncHandler.util';

const router = Router();
const storeSettingsController = new StoreSettingsController();

router.get('/', authenticate, authorizeAdmin, asyncHandler(storeSettingsController.getStoreSettings));
router.put('/', authenticate, authorizeAdmin, asyncHandler(storeSettingsController.updateStoreSettings));

export default router;
