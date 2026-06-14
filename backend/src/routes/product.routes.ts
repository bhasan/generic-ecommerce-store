import { Router } from 'express';
import { body } from 'express-validator';
import productController from '../controllers/product.controller';
import { authenticate, optionalAuthenticate } from '../middleware/auth.middleware';
import { authorizeManagement, authorizeAdmin } from '../middleware/role.middleware';
import { asyncHandler } from '../utils/asyncHandler.util';
import { quantityDiscountValidators } from '../validators/quantityDiscount.validator';

const router = Router();

router.get('/', optionalAuthenticate, asyncHandler(productController.getAllProducts));
router.get('/export-zip', authenticate, authorizeManagement, asyncHandler(productController.exportZip));
router.get('/:id', optionalAuthenticate, asyncHandler(productController.getProductById));

router.post(
  '/',
  authenticate,
  authorizeManagement,
  [
    body('name').notEmpty().withMessage('Product name is required'),
    body('categoryId').isInt({ min: 1 }).withMessage('Category is required').toInt(),
    body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number'),
    body('description').optional().isString(),
    body('image').optional().isString(),
    body('images').optional().isArray(),
    body('stock').optional().isFloat({ min: 0 }),
    body('stockEnabled').optional().isBoolean(),
    body('hidden').optional().isBoolean(),
    body('vipOnly').optional().isBoolean(),
    body('allowedQuantitiesOverride').optional().isArray(),
    body('allowedQuantitiesOverride.*').optional().isFloat(),
    body('quantityDiscountsOverride').optional().isArray(),
    ...quantityDiscountValidators('quantityDiscountsOverride'),
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
    body('price').optional().isFloat({ min: 0 }).withMessage('Price must be a positive number'),
    body('description').optional().isString(),
    body('image').optional().isString(),
    body('images').optional().isArray(),
    body('stock').optional().isFloat({ min: 0 }),
    body('stockEnabled').optional().isBoolean(),
    body('hidden').optional().isBoolean(),
    body('vipOnly').optional().isBoolean(),
    body('allowedQuantitiesOverride').optional().isArray(),
    body('allowedQuantitiesOverride.*').optional().isFloat(),
    body('quantityDiscountsOverride').optional().isArray(),
    ...quantityDiscountValidators('quantityDiscountsOverride'),
  ],
  asyncHandler(productController.updateProduct)
);

router.delete('/:id', authenticate, authorizeAdmin, asyncHandler(productController.deleteProduct));

export default router;
