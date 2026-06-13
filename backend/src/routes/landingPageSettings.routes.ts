import { Router } from 'express';
import { LandingPageSettingsController } from '../controllers/landingPageSettings.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorizeManagement } from '../middleware/role.middleware';
import { asyncHandler } from '../utils/asyncHandler.util';

const router = Router();
const landingPageSettingsController = new LandingPageSettingsController();

router.get('/', authenticate, authorizeManagement, asyncHandler(landingPageSettingsController.getLandingPageSettings));
router.put('/', authenticate, authorizeManagement, asyncHandler(landingPageSettingsController.updateLandingPageSettings));

export default router;
