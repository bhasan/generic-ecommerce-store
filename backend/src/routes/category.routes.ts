import { Router } from 'express';
import { body } from 'express-validator';
import categoryController from '../controllers/category.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorizeManagement } from '../middleware/role.middleware';

const router = Router();

/**
 * @route   GET /api/categories
 * @desc    Get all categories (includes parent/children)
 * @access  Public
 */
router.get('/', categoryController.getAllCategories);

/**
 * @route   POST /api/categories
 * @desc    Create category
 * @access  Private (Management/Admin)
 */
router.post(
  '/',
  authenticate,
  authorizeManagement,
  [
    body('name').notEmpty().withMessage('Category name is required'),
    body('description').optional().isString(),
    body('parentId').optional({ nullable: true }).isInt({ min: 1 }).toInt(),
    body('sortOrder').optional().isInt().toInt()
  ],
  categoryController.createCategory
);

/**
 * @route   PUT /api/categories/:id
 * @desc    Update category
 * @access  Private (Management/Admin)
 */
router.put(
  '/:id',
  authenticate,
  authorizeManagement,
  [
    body('name').optional().notEmpty().withMessage('Category name cannot be empty'),
    body('description').optional().isString(),
    body('parentId').optional({ nullable: true }).isInt({ min: 1 }).toInt(),
    body('sortOrder').optional().isInt().toInt()
  ],
  categoryController.updateCategory
);

/**
 * @route   DELETE /api/categories/:id
 * @desc    Delete category
 * @access  Private (Management/Admin)
 */
router.delete('/:id', authenticate, authorizeManagement, categoryController.deleteCategory);

export default router;
