import { body } from 'express-validator';
import { AppError } from '../middleware/error.middleware';
import { StructuredDeliveryAddress } from '../utils/address.util';

export const ZIP_REGEX = /^\d{5}(-\d{4})?$/;

/** express-validator chain for a delivery address object.
 *  Use conditionalDeliveryAddressValidators when the field is only required for DELIVERY method. */
export const deliveryAddressValidators = [
  body('deliveryAddress').isObject().withMessage('Delivery address is required'),
  body('deliveryAddress.street').isString().trim().notEmpty().withMessage('Delivery street is required'),
  body('deliveryAddress.apartment').optional().isString().withMessage('Delivery apartment must be a string'),
  body('deliveryAddress.city').isString().trim().notEmpty().withMessage('Delivery city is required'),
  body('deliveryAddress.state').isString().trim().isLength({ min: 2, max: 2 }).withMessage('Delivery state must be a 2-letter code'),
  body('deliveryAddress.zipCode').isString().trim().matches(ZIP_REGEX).withMessage('Delivery ZIP code must be a valid ZIP code'),
];

/** Same validators but only applied when deliveryMethod === 'DELIVERY'. */
export const conditionalDeliveryAddressValidators = [
  body('deliveryAddress').custom((value, { req }) => {
    if (req.body.deliveryMethod !== 'DELIVERY') return true;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Delivery address is required for delivery orders');
    }
    return true;
  }),
  body('deliveryAddress.street')
    .if((_v, { req }) => req.body.deliveryMethod === 'DELIVERY')
    .isString().trim().notEmpty().withMessage('Delivery street is required'),
  body('deliveryAddress.apartment').optional().isString().withMessage('Delivery apartment must be a string'),
  body('deliveryAddress.city')
    .if((_v, { req }) => req.body.deliveryMethod === 'DELIVERY')
    .isString().trim().notEmpty().withMessage('Delivery city is required'),
  body('deliveryAddress.state')
    .if((_v, { req }) => req.body.deliveryMethod === 'DELIVERY')
    .isString().trim().isLength({ min: 2, max: 2 }).withMessage('Delivery state must be a 2-letter code'),
  body('deliveryAddress.zipCode')
    .if((_v, { req }) => req.body.deliveryMethod === 'DELIVERY')
    .isString().trim().matches(ZIP_REGEX).withMessage('Delivery ZIP code must be a valid ZIP code'),
];

/** Service-layer structural validation (not express-validator). Throws AppError on failure. */
export function validateDeliveryAddressShape(address: unknown): asserts address is StructuredDeliveryAddress {
  if (!address || typeof address !== 'object' || Array.isArray(address)) {
    throw new AppError('Delivery address is required for delivery orders', 400);
  }
  const a = address as Record<string, unknown>;
  if (!a.street || typeof a.street !== 'string' || !a.street.trim()) throw new AppError('Delivery street is required', 400);
  if (!a.city  || typeof a.city  !== 'string' || !a.city.trim())   throw new AppError('Delivery city is required', 400);
  if (!a.state || typeof a.state !== 'string' || a.state.trim().length !== 2) throw new AppError('Delivery state must be a 2-letter code', 400);
  if (!a.zipCode || typeof a.zipCode !== 'string' || !ZIP_REGEX.test(a.zipCode.trim())) throw new AppError('Delivery ZIP code must be a valid ZIP code', 400);
}
