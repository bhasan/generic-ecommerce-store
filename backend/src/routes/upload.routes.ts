import { Router } from 'express';
import uploadController from '../controllers/upload.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorizeManagement } from '../middleware/role.middleware';
import { upload } from '../config/multer';

const router = Router();

// Product image uploads enter here before media URLs are attached to products in admin flows.
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

// Bulk uploads feed gallery-style product editing where multiple media assets are attached together.
/**
 * @route   POST /api/upload/multiple
 * @desc    Upload multiple image files at once (max 20)
 * @access  Private (Management/Admin only)
 */
router.post(
  '/multiple',
  authenticate,
  authorizeManagement,
  upload.array('files', 20),
  uploadController.uploadImages
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

// File deletion keeps orphaned uploads from lingering after product/media changes.
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
