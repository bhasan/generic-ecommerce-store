import { Router } from 'express';
import { body, param, query } from 'express-validator';
import contactController from '../controllers/contact.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorizeManagement, authorizeAdmin } from '../middleware/role.middleware';
import { asyncHandler } from '../utils/asyncHandler.util';

const router = Router();

router.post(
  '/',
  authenticate,
  [
    body('subject')
      .notEmpty().withMessage('Subject is required')
      .isIn(['General Inquiry', 'Order Issue', 'Product Question', 'Delivery Problem', 'Feedback', 'Other'])
      .withMessage('Invalid subject selected'),
    body('orderId').optional({ nullable: true }).custom((value) => {
      if (value === null || value === '') return true;
      if (!/^\d+$/.test(value)) throw new Error('Order ID must be a number');
      return true;
    }),
    body('message')
      .notEmpty().withMessage('Message is required')
      .isLength({ min: 10, max: 1000 }).withMessage('Message must be between 10 and 1000 characters'),
  ],
  asyncHandler(contactController.submitContactForm)
);

router.get(
  '/messages',
  authenticate,
  authorizeManagement,
  [query('status').optional().isIn(['NEW', 'READ', 'RESOLVED']).withMessage('Invalid status filter')],
  asyncHandler(contactController.getAllMessages)
);

router.get('/messages/count', authenticate, authorizeManagement, asyncHandler(contactController.getNewMessageCount));

router.get(
  '/messages/:id',
  authenticate,
  authorizeManagement,
  [param('id').isInt().withMessage('Message ID must be a number')],
  asyncHandler(contactController.getMessageById)
);

router.patch(
  '/messages/:id',
  authenticate,
  authorizeManagement,
  [
    param('id').isInt().withMessage('Message ID must be a number'),
    body('status').optional().isIn(['NEW', 'READ', 'RESOLVED']).withMessage('Invalid status'),
    body('adminNotes').optional().isString().withMessage('Admin notes must be a string'),
  ],
  asyncHandler(contactController.updateMessage)
);

router.patch(
  '/messages/:id/read',
  authenticate,
  authorizeManagement,
  [param('id').isInt().withMessage('Message ID must be a number')],
  asyncHandler(contactController.markAsRead)
);

router.patch(
  '/messages/:id/resolve',
  authenticate,
  authorizeManagement,
  [param('id').isInt().withMessage('Message ID must be a number')],
  asyncHandler(contactController.markAsResolved)
);

router.post(
  '/messages/:id/reply',
  authenticate,
  authorizeManagement,
  [
    param('id').isInt().withMessage('Message ID must be a number'),
    body('replyMessage')
      .notEmpty().withMessage('Reply message is required')
      .isLength({ min: 10, max: 2000 }).withMessage('Reply message must be between 10 and 2000 characters'),
  ],
  asyncHandler(contactController.replyToMessage)
);

router.delete(
  '/messages/:id',
  authenticate,
  authorizeAdmin,
  [param('id').isInt().withMessage('Message ID must be a number')],
  asyncHandler(contactController.deleteMessage)
);

export default router;
