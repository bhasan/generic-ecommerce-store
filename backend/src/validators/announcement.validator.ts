import { body } from 'express-validator';

export const createAnnouncementValidators = [
  body('message')
    .notEmpty()
    .withMessage('Message is required'),
  body('type')
    .optional()
    .isIn(['INFO', 'WARNING', 'SUCCESS'])
    .withMessage('Invalid type. Must be INFO, WARNING, or SUCCESS'),
  body('dismissible').optional().isBoolean(),
  body('enabled').optional().isBoolean(),
];

export const updateAnnouncementValidators = [
  body('message')
    .optional()
    .notEmpty()
    .withMessage('Message cannot be empty'),
  body('type')
    .optional()
    .isIn(['INFO', 'WARNING', 'SUCCESS'])
    .withMessage('Invalid type. Must be INFO, WARNING, or SUCCESS'),
  body('dismissible').optional().isBoolean(),
  body('enabled').optional().isBoolean(),
];
