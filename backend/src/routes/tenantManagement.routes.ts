// TEMPORARY: tenant management lives here and is gated to the PLATFORM admin
// (super-admin, or the default 'app' tenant's admin). It will move to a dedicated
// super-admin portal later. It must NEVER be gated by the per-tenant ADMIN role,
// which would let any tenant's admin manage every tenant (cross-tenant escalation).
import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requirePlatformAdmin } from '../middleware/role.middleware';
import { tenantManagementController } from '../controllers/tenantManagement.controller';
import { asyncHandler } from '../utils/asyncHandler.util';

const router = Router();

router.get(
  '/',
  authenticate,
  requirePlatformAdmin,
  asyncHandler(tenantManagementController.list.bind(tenantManagementController)),
);

router.post(
  '/',
  authenticate,
  requirePlatformAdmin,
  asyncHandler(tenantManagementController.create.bind(tenantManagementController)),
);

router.patch(
  '/:id/status',
  authenticate,
  requirePlatformAdmin,
  asyncHandler(tenantManagementController.setStatus.bind(tenantManagementController)),
);

router.post(
  '/:id/regenerate-tokens',
  authenticate,
  requirePlatformAdmin,
  asyncHandler(tenantManagementController.regenerateTokens.bind(tenantManagementController)),
);

export default router;
