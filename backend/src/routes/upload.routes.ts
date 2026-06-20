import { Router } from 'express';
import multer from 'multer';
import uploadController from '../controllers/upload.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorizeManagement, authorizeAdmin } from '../middleware/role.middleware';
import { upload } from '../config/multer';
import { asyncHandler } from '../utils/asyncHandler.util';

const router = Router();

// Memory-storage multer for ZIP imports — file stays as a Buffer, no rename.
const memUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
});

router.post('/import-zip', authenticate, authorizeManagement, memUpload.single('file'), asyncHandler(uploadController.importZip));
// Product image uploads enter here before media URLs are attached to products in admin flows.
router.post('/', authenticate, authorizeManagement, upload.single('file'), asyncHandler(uploadController.uploadImage));
// Bulk uploads feed gallery-style product editing where multiple media assets are attached together.
router.post('/multiple', authenticate, authorizeManagement, upload.array('files', 20), asyncHandler(uploadController.uploadImages));
router.get('/', authenticate, authorizeManagement, asyncHandler(uploadController.getImages));
// File deletion keeps orphaned uploads from lingering after product/media changes.
router.delete('/:filename', authenticate, authorizeManagement, asyncHandler(uploadController.deleteImage));
router.post('/favicon', authenticate, authorizeAdmin, upload.single('file'), asyncHandler(uploadController.uploadFavicon));

export default router;
