import { Request, Response } from 'express';
import { AnnouncementService } from '../services/announcement.service';
import { logAuditEvent } from '../utils/auditLog.util';

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
    const id = parseInt(req.params.id, 10);
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

    logAuditEvent(req, 'Announcement create requested', {
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
    const id = parseInt(req.params.id, 10);

    const { message, type, dismissible, enabled } = req.body;

    if (message !== undefined && (typeof message !== 'string' || message.trim().length === 0)) {
      res.status(400).json({ error: 'Message cannot be empty' });
      return;
    }

    if (type && !['INFO', 'WARNING', 'SUCCESS'].includes(type)) {
      res.status(400).json({ error: 'Invalid type. Must be INFO, WARNING, or SUCCESS' });
      return;
    }

    logAuditEvent(req, 'Announcement update requested', {
      targetAnnouncementId: id,
      fields: Object.keys(req.body || {}),
    });
    const announcement = await announcementService.updateAnnouncement(id, { message, type, dismissible, enabled });
    res.status(200).json({ message: 'Announcement updated successfully', announcement });
  }

  async deleteAnnouncement(req: Request, res: Response) : Promise<void> {
    const id = parseInt(req.params.id, 10);
    logAuditEvent(req, 'Announcement delete requested', {
      targetAnnouncementId: id,
    });
    await announcementService.deleteAnnouncement(id);
    res.status(200).json({ message: 'Announcement deleted successfully' });
  }
}
