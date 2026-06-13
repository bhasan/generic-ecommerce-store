import { Router } from 'express';
import { brandingController } from '../controllers/branding.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorizeAdmin } from '../middleware/role.middleware';
import { asyncHandler } from '../utils/asyncHandler.util';

const router = Router();

router.get('/', authenticate, authorizeAdmin, asyncHandler(brandingController.getBranding));
router.put('/', authenticate, authorizeAdmin, asyncHandler(brandingController.updateBranding));

export default router;
