import { Router } from 'express';
import { StoreSettingsController } from '../controllers/storeSettings.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorizeAdmin } from '../middleware/role.middleware';

const router = Router();
const storeSettingsController = new StoreSettingsController();

/**
 * @route   GET /api/store-settings
 * @desc    Get store settings (admin only)
 * @access  Private (Admin only)
 */
router.get('/', authenticate, authorizeAdmin, storeSettingsController.getStoreSettings);

/**
 * @route   PUT /api/store-settings
 * @desc    Update store settings (admin only)
 * @access  Private (Admin only)
 */
router.put('/', authenticate, authorizeAdmin, storeSettingsController.updateStoreSettings);

export default router;
