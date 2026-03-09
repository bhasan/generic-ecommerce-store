import { Router } from 'express';
import uploadController from '../controllers/upload.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorizeManagement, authorizeAdmin } from '../middleware/role.middleware';
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

export default router;
