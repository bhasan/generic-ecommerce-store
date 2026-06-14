import { Request, Response } from 'express';
import { AnnouncementService } from '../services/announcement.service';
import { logger } from '../utils/logger';
import { parseIntParam } from '../utils/request.util';

const announcementService = new AnnouncementService();

export class AnnouncementController {
  async getActiveAnnouncements(_req: Request, res: Response) : Promise<void> {
    const announcements = await announcementService.getActiveAnnouncements();
    res.status(200).json(announcements);
  }

  async getAllAnnouncements(_req: Request, res: Response) : Promise<void> {
    const announcements = await announcementService.getAllAnnouncements();
    res.status(200).json(announcements);
  }

  async getAnnouncementById(req: Request, res: Response) : Promise<void> {
    const id = parseIntParam(req.params.id, res, 'announcement');
    if (id === null) return;
    const announcement = await announcementService.getAnnouncementById(id);
    res.status(200).json(announcement);
  }

  async createAnnouncement(req: Request, res: Response) : Promise<void> {
    const { message, type, dismissible, enabled } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      res.status(400).json({ error: 'Message is required' });
      return;
    }

    if (type && !['INFO', 'WARNING', 'SUCCESS'].includes(type)) {
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
      enabled: enabled !== undefined ? enabled : true,
    });
    res.status(201).json({ message: 'Announcement created successfully', announcement });
  }

  async updateAnnouncement(req: Request, res: Response) : Promise<void> {
    const id = parseIntParam(req.params.id, res, 'announcement');
    if (id === null) return;

    const { message, type, dismissible, enabled } = req.body;

    if (message !== undefined && (typeof message !== 'string' || message.trim().length === 0)) {
      res.status(400).json({ error: 'Message cannot be empty' });
      return;
    }

    if (type && !['INFO', 'WARNING', 'SUCCESS'].includes(type)) {
      res.status(400).json({ error: 'Invalid type. Must be INFO, WARNING, or SUCCESS' });
      return;
    }

    logger.info('Announcement update requested', {
      requestId: req.requestId || 'unknown',
      actorUserId: req.user?.userId || 'anonymous',
      targetAnnouncementId: id,
      fields: Object.keys(req.body || {}),
    });
    const announcement = await announcementService.updateAnnouncement(id, { message, type, dismissible, enabled });
    res.status(200).json({ message: 'Announcement updated successfully', announcement });
  }

  async deleteAnnouncement(req: Request, res: Response) : Promise<void> {
    const id = parseIntParam(req.params.id, res, 'announcement');
    if (id === null) return;
    logger.info('Announcement delete requested', {
      requestId: req.requestId || 'unknown',
      actorUserId: req.user?.userId || 'anonymous',
      targetAnnouncementId: id,
    });
    await announcementService.deleteAnnouncement(id);
    res.status(200).json({ message: 'Announcement deleted successfully' });
  }
}
