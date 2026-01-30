import { Router } from 'express';
import { body } from 'express-validator';
import contactController from '../controllers/contact.controller';
import { authenticate } from '../middleware/auth.middleware';

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

export default router;
