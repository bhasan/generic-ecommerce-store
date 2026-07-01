// TEMPORARY: tenant management lives in website-management for now but is a PLATFORM
// function — it manages every tenant on the instance — so it is gated to SUPER_ADMIN
// only. It will move to a dedicated super-admin portal later. It must NEVER be gated
// by the per-tenant ADMIN role, which would let any tenant's admin manage every
// tenant (cross-tenant privilege escalation). Regular admins are per-tenant.
import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireSuperAdmin } from '../middleware/role.middleware';
import { tenantManagementController } from '../controllers/tenantManagement.controller';
import { asyncHandler } from '../utils/asyncHandler.util';

const router = Router();

router.get(
  '/',
  authenticate,
  requireSuperAdmin,
  asyncHandler(tenantManagementController.list.bind(tenantManagementController)),
);

router.post(
  '/',
  authenticate,
  requireSuperAdmin,
  asyncHandler(tenantManagementController.create.bind(tenantManagementController)),
);

router.patch(
  '/:id/status',
  authenticate,
  requireSuperAdmin,
  asyncHandler(tenantManagementController.setStatus.bind(tenantManagementController)),
);

router.delete(
  '/:id',
  authenticate,
  requireSuperAdmin,
  asyncHandler(tenantManagementController.remove.bind(tenantManagementController)),
);

router.patch(
  '/:id',
  authenticate,
  requireSuperAdmin,
  asyncHandler(tenantManagementController.update.bind(tenantManagementController)),
);

router.post(
  '/:id/regenerate-tokens',
  authenticate,
  requireSuperAdmin,
  asyncHandler(tenantManagementController.regenerateTokens.bind(tenantManagementController)),
);

export default router;
