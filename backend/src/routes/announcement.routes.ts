import { Router } from 'express';
import { AnnouncementController } from '../controllers/announcement.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorizeAdmin } from '../middleware/role.middleware';
import { asyncHandler } from '../utils/asyncHandler.util';
import { requireIntParam } from '../middleware/parseParam.middleware';

const router = Router();
const announcementController = new AnnouncementController();

router.get('/active', asyncHandler(announcementController.getActiveAnnouncements));
router.get('/', authenticate, authorizeAdmin, asyncHandler(announcementController.getAllAnnouncements));
router.get('/:id', authenticate, authorizeAdmin, requireIntParam('id', 'announcement'), asyncHandler(announcementController.getAnnouncementById));
router.post('/', authenticate, authorizeAdmin, asyncHandler(announcementController.createAnnouncement));
router.patch('/:id', authenticate, authorizeAdmin, requireIntParam('id', 'announcement'), asyncHandler(announcementController.updateAnnouncement));
router.delete('/:id', authenticate, authorizeAdmin, requireIntParam('id', 'announcement'), asyncHandler(announcementController.deleteAnnouncement));

export default router;
