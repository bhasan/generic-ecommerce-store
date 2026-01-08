import { Router } from 'express';
import { AnnouncementController } from '../controllers/announcement.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorizeAdmin } from '../middleware/role.middleware';

const router = Router();
const announcementController = new AnnouncementController();

/**
 * @route   GET /api/announcements/active
 * @desc    Get all active announcements
 * @access  Public
 */
router.get('/active', announcementController.getActiveAnnouncements);

/**
 * @route   GET /api/announcements
 * @desc    Get all announcements (admin only)
 * @access  Private (Admin only)
 */
router.get('/', authenticate, authorizeAdmin, announcementController.getAllAnnouncements);

/**
 * @route   GET /api/announcements/:id
 * @desc    Get announcement by ID (admin only)
 * @access  Private (Admin only)
 */
router.get('/:id', authenticate, authorizeAdmin, announcementController.getAnnouncementById);

/**
 * @route   POST /api/announcements
 * @desc    Create announcement (admin only)
 * @access  Private (Admin only)
 */
router.post('/', authenticate, authorizeAdmin, announcementController.createAnnouncement);

/**
 * @route   PATCH /api/announcements/:id
 * @desc    Update announcement (admin only)
 * @access  Private (Admin only)
 */
router.patch('/:id', authenticate, authorizeAdmin, announcementController.updateAnnouncement);

/**
 * @route   DELETE /api/announcements/:id
 * @desc    Delete announcement (admin only)
 * @access  Private (Admin only)
 */
router.delete('/:id', authenticate, authorizeAdmin, announcementController.deleteAnnouncement);

export default router;

