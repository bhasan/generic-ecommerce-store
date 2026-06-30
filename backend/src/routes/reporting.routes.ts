import { Router } from 'express';
import reportingController from '../controllers/reporting.controller';
import {
  assignReportingRequestId,
  reportingIpRateLimiter,
  reportingTenantRateLimiter,
  requireReportingAuth,
  requireReportingEnabled,
} from '../middleware/reportingAuth.middleware';
import { asyncHandler } from '../utils/asyncHandler.util';

const router = Router();

router.use(assignReportingRequestId);
router.use(requireReportingEnabled);
router.use(reportingIpRateLimiter);      // pre-auth, IP-keyed: anti-flood on the token lookup
router.use(requireReportingAuth);        // sets req.tenantId from the per-tenant token
router.use(reportingTenantRateLimiter);  // post-auth, per-tenant: fair-share across tenants

router.get('/health', reportingController.health);
router.get('/metadata', reportingController.metadata);
router.get('/products', asyncHandler(reportingController.products));
router.get('/categories', asyncHandler(reportingController.categories));
router.get('/inventory-snapshots', asyncHandler(reportingController.inventorySnapshots));
router.get('/orders', asyncHandler(reportingController.orders));
router.get('/refunds', asyncHandler(reportingController.refunds));

export default router;
