import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { authorizeEmployee } from '../middleware/role.middleware';
import * as notificationController from '../controllers/notification.controller';

const router = Router();

/**
 * @route   GET /api/notifications/staff
 * @desc    Get staff notification counts (orders by status, pending registrations)
 * @access  Private (Employee, Management, Admin)
 */
router.get(
  '/staff',
  authenticate,
  authorizeEmployee,
  notificationController.getStaffNotificationCounts
);

export default router;
