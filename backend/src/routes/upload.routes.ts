import { Router } from 'express';
import uploadController from '../controllers/upload.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorizeManagement } from '../middleware/role.middleware';
import { upload } from '../config/multer';

const router = Router();

/**
 * @route   POST /api/upload
 * @desc    Upload a single image file (for product images, etc.)
 * @access  Private (Management/Admin only)
 */
router.post(
  '/',
  authenticate,
  authorizeManagement,
  upload.single('file'),
  uploadController.uploadImage
);

/**
 * @route   GET /api/upload
 * @desc    Get a list of all uploaded images
 * @access  Private (Management/Admin only)
 */
router.get(
  '/',
  authenticate,
  authorizeManagement,
  uploadController.getImages
);

/**
 * @route   DELETE /api/upload/:filename
 * @desc    Delete a specific uploaded image
 * @access  Private (Management/Admin only)
 */
router.delete(
  '/:filename',
  authenticate,
  authorizeManagement,
  uploadController.deleteImage
);

export default router;
