import { Router } from 'express';
import multer from 'multer';
import uploadController from '../controllers/upload.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorizeManagement, authorizeAdmin } from '../middleware/role.middleware';
import { upload } from '../config/multer';

const router = Router();

// Memory-storage multer for ZIP imports — file stays as a Buffer, no rename.
const memUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
});

/**
 * @route   POST /api/upload/import-zip
 * @desc    Import images from a ZIP archive, preserving original filenames (bypasses rename)
 * @access  Private (Management/Admin only)
 */
router.post(
  '/import-zip',
  authenticate,
  authorizeManagement,
  memUpload.single('file'),
  uploadController.importZip
);

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

/**
 * @route   POST /api/upload/favicon
 * @desc    Upload a favicon image and generate 16x16, 32x32, and 180x180 PNG variants
 * @access  Private (Admin only)
 */
router.post(
  '/favicon',
  authenticate,
  authorizeAdmin,
  upload.single('file'),
  uploadController.uploadFavicon
);

export default router;
