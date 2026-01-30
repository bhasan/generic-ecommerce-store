import { Router } from 'express';
import { body, param, query } from 'express-validator';
import contactController from '../controllers/contact.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorizeManagement, authorizeAdmin } from '../middleware/role.middleware';

const router = Router();

/**
 * @route   POST /api/contact
 * @desc    Submit a contact form message
 * @access  Private (requires authentication)
 */
router.post(
  '/',
  authenticate,
  [
    body('subject')
      .notEmpty()
      .withMessage('Subject is required')
      .isIn(['General Inquiry', 'Order Issue', 'Product Question', 'Delivery Problem', 'Feedback', 'Other'])
      .withMessage('Invalid subject selected'),
    body('orderId')
      .optional({ nullable: true })
      .custom((value) => {
        if (value === null || value === '') return true;
        if (!/^\d+$/.test(value)) {
          throw new Error('Order ID must be a number');
        }
        return true;
      }),
    body('message')
      .notEmpty()
      .withMessage('Message is required')
      .isLength({ min: 10, max: 1000 })
      .withMessage('Message must be between 10 and 1000 characters'),
  ],
  contactController.submitContactForm
);

/**
 * @route   GET /api/contact/messages
 * @desc    Get all contact messages (with optional filters)
 * @access  Private (Admin/Manager only)
 */
router.get(
  '/messages',
  authenticate,
  authorizeManagement,
  [
    query('status')
      .optional()
      .isIn(['NEW', 'READ', 'RESOLVED'])
      .withMessage('Invalid status filter')
  ],
  contactController.getAllMessages
);

/**
 * @route   GET /api/contact/messages/count
 * @desc    Get count of new (unread) messages
 * @access  Private (Admin/Manager only)
 */
router.get(
  '/messages/count',
  authenticate,
  authorizeManagement,
  contactController.getNewMessageCount
);

/**
 * @route   GET /api/contact/messages/:id
 * @desc    Get single message by ID
 * @access  Private (Admin/Manager only)
 */
router.get(
  '/messages/:id',
  authenticate,
  authorizeManagement,
  [
    param('id').isInt().withMessage('Message ID must be a number')
  ],
  contactController.getMessageById
);

/**
 * @route   PATCH /api/contact/messages/:id
 * @desc    Update message status and/or admin notes
 * @access  Private (Admin/Manager only)
 */
router.patch(
  '/messages/:id',
  authenticate,
  authorizeManagement,
  [
    param('id').isInt().withMessage('Message ID must be a number'),
    body('status')
      .optional()
      .isIn(['NEW', 'READ', 'RESOLVED'])
      .withMessage('Invalid status'),
    body('adminNotes')
      .optional()
      .isString()
      .withMessage('Admin notes must be a string')
  ],
  contactController.updateMessage
);

/**
 * @route   PATCH /api/contact/messages/:id/read
 * @desc    Mark message as read
 * @access  Private (Admin/Manager only)
 */
router.patch(
  '/messages/:id/read',
  authenticate,
  authorizeManagement,
  [
    param('id').isInt().withMessage('Message ID must be a number')
  ],
  contactController.markAsRead
);

/**
 * @route   PATCH /api/contact/messages/:id/resolve
 * @desc    Mark message as resolved
 * @access  Private (Admin/Manager only)
 */
router.patch(
  '/messages/:id/resolve',
  authenticate,
  authorizeManagement,
  [
    param('id').isInt().withMessage('Message ID must be a number')
  ],
  contactController.markAsResolved
);

/**
 * @route   POST /api/contact/messages/:id/reply
 * @desc    Reply to a message (sends email to customer)
 * @access  Private (Admin/Manager only)
 */
router.post(
  '/messages/:id/reply',
  authenticate,
  authorizeManagement,
  [
    param('id').isInt().withMessage('Message ID must be a number'),
    body('replyMessage')
      .notEmpty()
      .withMessage('Reply message is required')
      .isLength({ min: 10, max: 2000 })
      .withMessage('Reply message must be between 10 and 2000 characters')
  ],
  contactController.replyToMessage
);

/**
 * @route   DELETE /api/contact/messages/:id
 * @desc    Delete a message
 * @access  Private (Admin only)
 */
router.delete(
  '/messages/:id',
  authenticate,
  authorizeAdmin,
  [
    param('id').isInt().withMessage('Message ID must be a number')
  ],
  contactController.deleteMessage
);

export default router;
