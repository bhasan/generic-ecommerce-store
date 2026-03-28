import { Router } from 'express';
import { body } from 'express-validator';
import creditController from '../controllers/credit.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorizeManagement } from '../middleware/role.middleware';

const router = Router();

/**
 * @route   GET /api/credits/:userId
 * @desc    Get credit balance for a user
 * @access  Private (Own user or Management/Admin)
 */
router.get('/:userId', authenticate, creditController.getBalance);

/**
 * @route   GET /api/credits/:userId/transactions
 * @desc    Get credit transaction history for a user
 * @access  Private (Own user or Management/Admin)
 */
router.get('/:userId/transactions', authenticate, creditController.getTransactions);

/**
 * @route   POST /api/credits/:userId/add
 * @desc    Add credit to a user's account
 * @access  Private (Management/Admin only)
 */
router.post(
  '/:userId/add',
  authenticate,
  authorizeManagement,
  [
    body('amount').isFloat({ gt: 0 }).withMessage('Amount must be a positive number'),
    body('note').optional().isString().withMessage('Note must be a string')
  ],
  creditController.addCredit
);

/**
 * @route   POST /api/credits/:userId/remove
 * @desc    Remove credit from a user's account
 * @access  Private (Management/Admin only)
 */
router.post(
  '/:userId/remove',
  authenticate,
  authorizeManagement,
  [
    body('amount').isFloat({ gt: 0 }).withMessage('Amount must be a positive number'),
    body('note').optional().isString().withMessage('Note must be a string')
  ],
  creditController.removeCredit
);

export default router;
