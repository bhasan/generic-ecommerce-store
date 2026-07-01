import { Router } from 'express';
import { body } from 'express-validator';
import userController from '../controllers/user.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorizeManagement, authorizeAdmin } from '../middleware/role.middleware';
import { ROLE_NAMES } from '../constants/roles';
import { asyncHandler } from '../utils/asyncHandler.util';
import { requireIntParam } from '../middleware/parseParam.middleware';

const router = Router();

router.get('/', authenticate, authorizeManagement, asyncHandler(userController.getAllUsers));
router.get('/roles', authenticate, authorizeManagement, asyncHandler(userController.getAllRoles));
router.get('/pending', authenticate, authorizeManagement, asyncHandler(userController.getPendingRegistrations));
router.get('/rejected', authenticate, authorizeAdmin, asyncHandler(userController.getRejectedUsers));
router.get('/:id', authenticate, requireIntParam('id', 'user'), asyncHandler(userController.getUserById));

router.put(
  '/:id',
  authenticate,
  requireIntParam('id', 'user'),
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

router.post('/:id/approve', authenticate, authorizeManagement, requireIntParam('id', 'user'), asyncHandler(userController.approveUser));
router.post('/:id/reject', authenticate, authorizeManagement, requireIntParam('id', 'user'), asyncHandler(userController.rejectUser));
router.post('/:id/unreject', authenticate, authorizeManagement, requireIntParam('id', 'user'), asyncHandler(userController.unRejectUser));
router.get('/:id/store-roles', authenticate, authorizeAdmin, requireIntParam('id', 'user'), asyncHandler(userController.getStoreRoles));
router.put('/:id/store-roles', authenticate, authorizeAdmin, requireIntParam('id', 'user'), asyncHandler(userController.setStoreRoles));
router.delete('/:id', authenticate, authorizeAdmin, requireIntParam('id', 'user'), asyncHandler(userController.deleteUser));

export default router;
