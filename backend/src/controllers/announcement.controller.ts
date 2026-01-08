import { Request, Response, NextFunction } from 'express';
import { AnnouncementService } from '../services/announcement.service';

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
        res.status(400).json({ error: 'Message is required' });
        return;
      }

      if (type && !['INFO', 'WARNING', 'SUCCESS'].includes(type)) {
        res.status(400).json({ error: 'Invalid type. Must be INFO, WARNING, or SUCCESS' });
        return;
      }

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
        res.status(400).json({ error: 'Invalid announcement ID' });
        return;
      }

      const { message, type, dismissible, enabled } = req.body;

      if (message !== undefined && (typeof message !== 'string' || message.trim().length === 0)) {
        res.status(400).json({ error: 'Message cannot be empty' });
        return;
      }

      if (type && !['INFO', 'WARNING', 'SUCCESS'].includes(type)) {
        res.status(400).json({ error: 'Invalid type. Must be INFO, WARNING, or SUCCESS' });
        return;
      }

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
        res.status(400).json({ error: 'Invalid announcement ID' });
        return;
      }

      await announcementService.deleteAnnouncement(id);

      res.status(200).json({
        message: 'Announcement deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  }
}

