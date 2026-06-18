import { Router } from 'express';
import { body } from 'express-validator';
import categoryController from '../controllers/category.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorizeManagement } from '../middleware/role.middleware';
import { asyncHandler } from '../utils/asyncHandler.util';

const router = Router();

router.get('/', asyncHandler(categoryController.getAllCategories));

router.post(
  '/',
  authenticate,
  authorizeManagement,
  [
    body('name').notEmpty().withMessage('Category name is required'),
    body('description').optional().isString(),
    body('parentId').optional({ nullable: true }).isInt({ min: 1 }).toInt(),
    body('sortOrder').optional().isInt().toInt(),
  ],
  asyncHandler(categoryController.createCategory)
);

router.put(
  '/:id',
  authenticate,
  authorizeManagement,
  [
    body('name').optional().notEmpty().withMessage('Category name cannot be empty'),
    body('description').optional().isString(),
    body('parentId').optional({ nullable: true }).isInt({ min: 1 }).toInt(),
    body('sortOrder').optional().isInt().toInt(),
  ],
  asyncHandler(categoryController.updateCategory)
);

router.delete('/:id', authenticate, authorizeManagement, asyncHandler(categoryController.deleteCategory));

export default router;
