import { Router } from 'express';
import { AnnouncementController } from '../controllers/announcement.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorizeAdmin } from '../middleware/role.middleware';
import { asyncHandler } from '../utils/asyncHandler.util';

const router = Router();
const announcementController = new AnnouncementController();

router.get('/active', asyncHandler(announcementController.getActiveAnnouncements));
router.get('/', authenticate, authorizeAdmin, asyncHandler(announcementController.getAllAnnouncements));
router.get('/:id', authenticate, authorizeAdmin, asyncHandler(announcementController.getAnnouncementById));
router.post('/', authenticate, authorizeAdmin, asyncHandler(announcementController.createAnnouncement));
router.patch('/:id', authenticate, authorizeAdmin, asyncHandler(announcementController.updateAnnouncement));
router.delete('/:id', authenticate, authorizeAdmin, asyncHandler(announcementController.deleteAnnouncement));

export default router;
