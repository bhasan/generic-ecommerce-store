import { Router } from 'express';
import { body } from 'express-validator';
import creditController from '../controllers/store-credit.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorizeManagement } from '../middleware/role.middleware';
import { asyncHandler } from '../utils/asyncHandler.util';
import { requireIntParam } from '../middleware/parseParam.middleware';

const router = Router();

router.get('/:userId', authenticate, requireIntParam('userId', 'user'), asyncHandler(creditController.getBalance));
router.get('/:userId/transactions', authenticate, requireIntParam('userId', 'user'), asyncHandler(creditController.getTransactions));

router.post(
  '/:userId/add',
  authenticate,
  authorizeManagement,
  requireIntParam('userId', 'user'),
  [
    body('amount').isFloat({ gt: 0 }).withMessage('Amount must be a positive number'),
    body('note').optional().isString().withMessage('Note must be a string'),
  ],
  asyncHandler(creditController.addCredit)
);

router.post(
  '/:userId/remove',
  authenticate,
  authorizeManagement,
  requireIntParam('userId', 'user'),
  [
    body('amount').isFloat({ gt: 0 }).withMessage('Amount must be a positive number'),
    body('note').optional().isString().withMessage('Note must be a string'),
  ],
  asyncHandler(creditController.removeCredit)
);

export default router;
