import { Router } from 'express';
import { body } from 'express-validator';
import productController from '../controllers/product.controller';
import { authenticate, optionalAuthenticate } from '../middleware/auth.middleware';
import { authorizeManagement, authorizeAdmin } from '../middleware/role.middleware';

const router = Router();

/**
 * @route   GET /api/products
 * @desc    Get all products
 * @access  Public (but filtered based on auth)
 */
router.get('/', optionalAuthenticate, productController.getAllProducts);

/**
 * @route   GET /api/products/:id
 * @desc    Get product by ID
 * @access  Public (but filtered based on auth)
 */
router.get('/:id', optionalAuthenticate, productController.getProductById);

/**
 * @route   POST /api/products
 * @desc    Create a new product
 * @access  Private (Management/Admin only)
 */
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
    body('allowedQuantitiesOverride').optional().isArray(),
    body('allowedQuantitiesOverride.*').optional().isFloat()
  ],
  productController.createProduct
);

/**
 * @route   PUT /api/products/:id
 * @desc    Update a product
 * @access  Private (Management/Admin only)
 */
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
    body('allowedQuantitiesOverride').optional().isArray(),
    body('allowedQuantitiesOverride.*').optional().isFloat()
  ],
  productController.updateProduct
);

/**
 * @route   DELETE /api/products/:id
 * @desc    Delete a product
 * @access  Private (Admin only)
 */
router.delete('/:id', authenticate, authorizeAdmin, productController.deleteProduct);

export default router;
