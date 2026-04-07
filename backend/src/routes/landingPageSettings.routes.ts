import { Router } from 'express';
import { LandingPageSettingsController } from '../controllers/landingPageSettings.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorizeManagement } from '../middleware/role.middleware';

const router = Router();
const landingPageSettingsController = new LandingPageSettingsController();

/**
 * @route   GET /api/landing-page-settings
 * @desc    Get landing page settings (management only)
 * @access  Private (Management/Admin)
 */
router.get('/', authenticate, authorizeManagement, landingPageSettingsController.getLandingPageSettings);

/**
 * @route   PUT /api/landing-page-settings
 * @desc    Update landing page settings (management only)
 * @access  Private (Management/Admin)
 */
router.put('/', authenticate, authorizeManagement, landingPageSettingsController.updateLandingPageSettings);

export default router;
