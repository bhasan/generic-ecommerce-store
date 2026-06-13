import { Router } from 'express';
import { body } from 'express-validator';
import userController from '../controllers/user.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorizeManagement, authorizeAdmin } from '../middleware/role.middleware';
import { ROLE_NAMES } from '../constants/roles';
import { asyncHandler } from '../utils/asyncHandler.util';

const router = Router();

router.get('/', authenticate, authorizeManagement, asyncHandler(userController.getAllUsers));
router.get('/roles', authenticate, authorizeManagement, asyncHandler(userController.getAllRoles));
router.get('/pending', authenticate, authorizeManagement, asyncHandler(userController.getPendingRegistrations));
router.get('/rejected', authenticate, authorizeAdmin, asyncHandler(userController.getRejectedUsers));
router.get('/:id', authenticate, asyncHandler(userController.getUserById));

router.put(
  '/:id',
  authenticate,
  [
    body('username').optional().isString().withMessage('Username must be a string'),
    body('password').optional().isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('currentPassword').optional().isString().withMessage('Current password must be a string'),
    body('roles').optional().isArray().withMessage('Roles must be an array'),
    body('roles.*').optional().isIn(ROLE_NAMES).withMessage('Invalid role'),
    body('address').optional({ values: 'null' }).isString().withMessage('Address must be a string'),
    body('cashapp').optional({ values: 'null' }).isString().withMessage('CashApp must be a string'),
    body('phoneNumber').optional({ values: 'null' }).isString().withMessage('Phone number must be a string'),
  ],
  asyncHandler(userController.updateUser)
);

router.post('/:id/approve', authenticate, authorizeManagement, asyncHandler(userController.approveUser));
router.post('/:id/reject', authenticate, authorizeManagement, asyncHandler(userController.rejectUser));
router.post('/:id/unreject', authenticate, authorizeManagement, asyncHandler(userController.unRejectUser));
router.delete('/:id', authenticate, authorizeAdmin, asyncHandler(userController.deleteUser));

export default router;
