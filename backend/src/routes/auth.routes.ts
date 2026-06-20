import { Router } from 'express';
import { body } from 'express-validator';
import authController from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';
import { asyncHandler } from '../utils/asyncHandler.util';

const router = Router();

router.post(
  '/register',
  [
    body('username').notEmpty().isString().withMessage('Username is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('address').optional().isString().withMessage('Address must be a string'),
    body('cashapp').optional().isString().withMessage('CashApp must be a string'),
    body('phoneNumber').notEmpty().withMessage('Phone number is required').isString().withMessage('Phone number must be a string'),
  ],
  asyncHandler(authController.register)
);

router.post(
  '/login',
  [
    body('username').notEmpty().withMessage('Username is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  asyncHandler(authController.login)
);

router.get('/profile', authenticate, asyncHandler(authController.getProfile));
router.post('/logout', authController.logout);

export default router;
