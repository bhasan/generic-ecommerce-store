// TEMPORARY: tenant management is admin-gated and will move to a dedicated super-admin scope later.
import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { authorizeAdmin } from '../middleware/role.middleware';
import { tenantManagementController } from '../controllers/tenantManagement.controller';
import { asyncHandler } from '../utils/asyncHandler.util';

const router = Router();

router.get(
  '/',
  authenticate,
  authorizeAdmin,
  asyncHandler(tenantManagementController.list.bind(tenantManagementController)),
);

router.post(
  '/',
  authenticate,
  authorizeAdmin,
  asyncHandler(tenantManagementController.create.bind(tenantManagementController)),
);

router.patch(
  '/:id/status',
  authenticate,
  authorizeAdmin,
  asyncHandler(tenantManagementController.setStatus.bind(tenantManagementController)),
);

router.post(
  '/:id/regenerate-tokens',
  authenticate,
  authorizeAdmin,
  asyncHandler(tenantManagementController.regenerateTokens.bind(tenantManagementController)),
);

export default router;
