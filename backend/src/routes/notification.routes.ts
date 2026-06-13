import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { authorizeEmployee } from '../middleware/role.middleware';
import * as notificationController from '../controllers/notification.controller';
import { asyncHandler } from '../utils/asyncHandler.util';

const router = Router();

router.get('/', authenticate, asyncHandler(notificationController.listNotifications));
router.get('/unread-count', authenticate, asyncHandler(notificationController.getUnreadNotificationCount));
router.patch('/:id/read', authenticate, asyncHandler(notificationController.markNotificationRead));
router.patch('/read-all', authenticate, asyncHandler(notificationController.markAllNotificationsRead));
router.get('/staff', authenticate, authorizeEmployee, asyncHandler(notificationController.getStaffNotificationCounts));

export default router;
