import { Router } from 'express';
import { brandingController } from '../controllers/branding.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorizeAdmin } from '../middleware/role.middleware';

const router = Router();

router.get('/', authenticate, authorizeAdmin, brandingController.getBranding);
router.put('/', authenticate, authorizeAdmin, brandingController.updateBranding);

export default router;
