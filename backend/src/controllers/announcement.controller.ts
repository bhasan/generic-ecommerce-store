import { Request, Response, NextFunction } from 'express';
import { AnnouncementService } from '../services/announcement.service';
import { logger } from '../utils/logger';

const announcementService = new AnnouncementService();

export class AnnouncementController {
  /**
   * Get all active announcements (public endpoint)
   * GET /api/announcements/active
   */
  async getActiveAnnouncements(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const announcements = await announcementService.getActiveAnnouncements();
      res.status(200).json(announcements);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all announcements (admin only)
   * GET /api/announcements
   */
  async getAllAnnouncements(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const announcements = await announcementService.getAllAnnouncements();
      res.status(200).json(announcements);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get announcement by ID (admin only)
   * GET /api/announcements/:id
   */
  async getAnnouncementById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id, 10);
      
      if (isNaN(id)) {
        logger.warn('Announcement lookup validation failed', {
          requestId: req.requestId || 'unknown',
          actorUserId: req.user?.userId || 'anonymous',
          targetAnnouncementId: req.params.id,
        });
        res.status(400).json({ error: 'Invalid announcement ID' });
        return;
      }

      const announcement = await announcementService.getAnnouncementById(id);
      res.status(200).json(announcement);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create announcement (admin only)
   * POST /api/announcements
   */
  async createAnnouncement(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { message, type, dismissible, enabled } = req.body;

      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        logger.warn('Announcement create validation failed', {
          requestId: req.requestId || 'unknown',
          actorUserId: req.user?.userId || 'anonymous',
          reason: 'Message is required',
        });
        res.status(400).json({ error: 'Message is required' });
        return;
      }

      if (type && !['INFO', 'WARNING', 'SUCCESS'].includes(type)) {
        logger.warn('Announcement create validation failed', {
          requestId: req.requestId || 'unknown',
          actorUserId: req.user?.userId || 'anonymous',
          reason: 'Invalid type',
          type,
        });
        res.status(400).json({ error: 'Invalid type. Must be INFO, WARNING, or SUCCESS' });
        return;
      }

      logger.info('Announcement create requested', {
        requestId: req.requestId || 'unknown',
        actorUserId: req.user?.userId || 'anonymous',
        type: type || 'INFO',
        enabled: enabled !== undefined ? enabled : true,
      });
      const announcement = await announcementService.createAnnouncement({
        message,
        type: type || 'INFO',
        dismissible: dismissible !== undefined ? dismissible : true,
        enabled: enabled !== undefined ? enabled : true
      });

      res.status(201).json({
        message: 'Announcement created successfully',
        announcement
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update announcement (admin only)
   * PATCH /api/announcements/:id
   */
  async updateAnnouncement(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id, 10);
      
      if (isNaN(id)) {
        logger.warn('Announcement update validation failed', {
          requestId: req.requestId || 'unknown',
          actorUserId: req.user?.userId || 'anonymous',
          targetAnnouncementId: req.params.id,
        });
        res.status(400).json({ error: 'Invalid announcement ID' });
        return;
      }

      const { message, type, dismissible, enabled } = req.body;

      if (message !== undefined && (typeof message !== 'string' || message.trim().length === 0)) {
        logger.warn('Announcement update validation failed', {
          requestId: req.requestId || 'unknown',
          actorUserId: req.user?.userId || 'anonymous',
          targetAnnouncementId: id,
          reason: 'Message cannot be empty',
        });
        res.status(400).json({ error: 'Message cannot be empty' });
        return;
      }

      if (type && !['INFO', 'WARNING', 'SUCCESS'].includes(type)) {
        logger.warn('Announcement update validation failed', {
          requestId: req.requestId || 'unknown',
          actorUserId: req.user?.userId || 'anonymous',
          targetAnnouncementId: id,
          reason: 'Invalid type',
          type,
        });
        res.status(400).json({ error: 'Invalid type. Must be INFO, WARNING, or SUCCESS' });
        return;
      }

      logger.info('Announcement update requested', {
        requestId: req.requestId || 'unknown',
        actorUserId: req.user?.userId || 'anonymous',
        targetAnnouncementId: id,
        fields: Object.keys(req.body || {}),
      });
      const announcement = await announcementService.updateAnnouncement(id, {
        message,
        type,
        dismissible,
        enabled
      });

      res.status(200).json({
        message: 'Announcement updated successfully',
        announcement
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete announcement (admin only)
   * DELETE /api/announcements/:id
   */
  async deleteAnnouncement(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id, 10);
      
      if (isNaN(id)) {
        logger.warn('Announcement delete validation failed', {
          requestId: req.requestId || 'unknown',
          actorUserId: req.user?.userId || 'anonymous',
          targetAnnouncementId: req.params.id,
        });
        res.status(400).json({ error: 'Invalid announcement ID' });
        return;
      }

      logger.info('Announcement delete requested', {
        requestId: req.requestId || 'unknown',
        actorUserId: req.user?.userId || 'anonymous',
        targetAnnouncementId: id,
      });
      await announcementService.deleteAnnouncement(id);

      res.status(200).json({
        message: 'Announcement deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  }
}

