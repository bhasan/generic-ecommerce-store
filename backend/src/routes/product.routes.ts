import { Router } from 'express';
import { body } from 'express-validator';
import productController from '../controllers/product.controller';
import { authenticate, optionalAuthenticate } from '../middleware/auth.middleware';
import { authorizeManagement, authorizeAdmin } from '../middleware/role.middleware';
import { asyncHandler } from '../utils/asyncHandler.util';

const router = Router();

const variantFieldValidators = [
  body('variants.*.sku').optional().isString(),
  body('variants.*.pricingMode').optional().isIn(['UNIT', 'WEIGHT']),
  body('variants.*.stock').optional().isFloat({ min: 0 }),
  body('variants.*.stockEnabled').optional().isBoolean(),
  body('variants.*.isDefault').optional().isBoolean(),
  body('variants.*.active').optional().isBoolean(),
  body('variants.*.quantityOptions').optional().isArray(),
  body('variants.*.quantityOptions.*.quantity').optional().isFloat({ min: 0 }),
  body('variants.*.priceBreaks').optional().isArray(),
  body('variants.*.priceBreaks.*.minQuantity').optional().isFloat({ min: 0 }),
  body('variants.*.priceBreaks.*.unitPrice').optional().isFloat({ min: 0 }),
];

const createVariantValidators = [
  body('variants').isArray({ min: 1 }).withMessage('At least one variant is required'),
  body('variants.*.label').notEmpty().withMessage('Variant label is required'),
  body('variants.*.basePrice').isFloat({ min: 0 }).withMessage('Variant basePrice must be a non-negative number'),
  ...variantFieldValidators,
];

const updateVariantValidators = [
  body('variants').optional().isArray(),
  body('variants.*.label').optional().notEmpty().withMessage('Variant label cannot be empty'),
  body('variants.*.basePrice').optional().isFloat({ min: 0 }).withMessage('Variant basePrice must be a non-negative number'),
  ...variantFieldValidators,
];

router.get('/', optionalAuthenticate, asyncHandler(productController.getAllProducts));
router.get('/export-zip', authenticate, authorizeManagement, asyncHandler(productController.exportZip));
router.get('/search', optionalAuthenticate, asyncHandler(productController.searchProducts));
router.get('/:id', optionalAuthenticate, asyncHandler(productController.getProductById));

router.post(
  '/',
  authenticate,
  authorizeManagement,
  [
    body('name').notEmpty().withMessage('Product name is required'),
    body('categoryId').isInt({ min: 1 }).withMessage('Category is required').toInt(),
    body('description').optional().isString(),
    body('slug').optional().isString(),
    body('hidden').optional().isBoolean(),
    body('vipOnly').optional().isBoolean(),
    body('images').optional().isArray(),
    body('images.*.url').optional().isString(),
    body('images.*.role').optional().isIn(['THUMBNAIL', 'GALLERY']),
    ...createVariantValidators,
  ],
  asyncHandler(productController.createProduct)
);

router.put(
  '/:id',
  authenticate,
  authorizeManagement,
  [
    body('name').optional().notEmpty().withMessage('Product name cannot be empty'),
    body('categoryId').optional().isInt({ min: 1 }).withMessage('Category cannot be empty').toInt(),
    body('description').optional().isString(),
    body('slug').optional().isString(),
    body('hidden').optional().isBoolean(),
    body('vipOnly').optional().isBoolean(),
    body('images').optional().isArray(),
    body('images.*.url').optional().isString(),
    body('images.*.role').optional().isIn(['THUMBNAIL', 'GALLERY']),
    ...updateVariantValidators,
  ],
  asyncHandler(productController.updateProduct)
);

router.delete('/:id', authenticate, authorizeAdmin, asyncHandler(productController.deleteProduct));

export default router;
