import { Router } from 'express';
import { body } from 'express-validator';
import userController from '../controllers/user.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorizeManagement, authorizeAdmin } from '../middleware/role.middleware';
import { ROLE_NAMES } from '../constants/roles';

const router = Router();

/**
 * @route   GET /api/users
 * @desc    Get all users
 * @access  Private (Management/Admin only)
 */
router.get('/', authenticate, authorizeManagement, userController.getAllUsers);

/**
 * @route   GET /api/users/:id
 * @desc    Get user by ID
 * @access  Private (Own profile or Management/Admin)
 */
router.get('/:id', authenticate, userController.getUserById);

/**
 * @route   PUT /api/users/:id
 * @desc    Update user
 * @access  Private (Own profile or Management/Admin)
 */
router.put(
  '/:id',
  authenticate,
  [
    body('email').optional().isEmail().withMessage('Valid email is required'),
    body('name').optional().notEmpty().withMessage('Name cannot be empty'),
    body('password').optional().isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('roles').optional().isArray({ min: 1 }).withMessage('Roles must be a non-empty array'),
    body('roles.*').optional().isIn(ROLE_NAMES).withMessage('Invalid role')
  ],
  userController.updateUser
);

/**
 * @route   DELETE /api/users/:id
 * @desc    Delete user
 * @access  Private (Admin only)
 */
router.delete('/:id', authenticate, authorizeAdmin, userController.deleteUser);

export default router;

