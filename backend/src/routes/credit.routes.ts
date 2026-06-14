import { Router } from 'express';
import { body } from 'express-validator';
import creditController from '../controllers/credit.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorizeManagement } from '../middleware/role.middleware';
import { asyncHandler } from '../utils/asyncHandler.util';

const router = Router();

router.get('/:userId', authenticate, asyncHandler(creditController.getBalance));
router.get('/:userId/transactions', authenticate, asyncHandler(creditController.getTransactions));

router.post(
  '/:userId/add',
  authenticate,
  authorizeManagement,
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
  [
    body('amount').isFloat({ gt: 0 }).withMessage('Amount must be a positive number'),
    body('note').optional().isString().withMessage('Note must be a string'),
  ],
  asyncHandler(creditController.removeCredit)
);

export default router;
