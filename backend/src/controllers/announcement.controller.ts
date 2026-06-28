import { Request, Response } from 'express';
import { AnnouncementService } from '../services/announcement.service';
import { logAuditEvent } from '../utils/auditLog.util';
import { validateRequest } from '../utils/request.util';
import { successResponse } from '../utils/responseEnvelope';

const announcementService = new AnnouncementService();

export class AnnouncementController {
  async getActiveAnnouncements(_req: Request, res: Response) : Promise<void> {
    const announcements = await announcementService.getActiveAnnouncements();
    res.status(200).json(successResponse(announcements));
  }

  async getAllAnnouncements(_req: Request, res: Response) : Promise<void> {
    const announcements = await announcementService.getAllAnnouncements();
    res.status(200).json(successResponse(announcements));
  }

  async getAnnouncementById(req: Request, res: Response) : Promise<void> {
    const id = parseInt(req.params.id, 10);
    const announcement = await announcementService.getAnnouncementById(id);
    res.status(200).json(successResponse(announcement));
  }

  async createAnnouncement(req: Request, res: Response) : Promise<void> {
    if (!validateRequest(req, res)) return;
    const { message, type, dismissible, enabled } = req.body;

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
    res.status(201).json(successResponse({ announcement }, 'Announcement created successfully'));
  }

  async updateAnnouncement(req: Request, res: Response) : Promise<void> {
    if (!validateRequest(req, res)) return;
    const id = parseInt(req.params.id, 10);

    const { message, type, dismissible, enabled } = req.body;

    logAuditEvent(req, 'Announcement update requested', {
      targetAnnouncementId: id,
      fields: Object.keys(req.body || {}),
    });
    const announcement = await announcementService.updateAnnouncement(id, { message, type, dismissible, enabled });
    res.status(200).json(successResponse({ announcement }, 'Announcement updated successfully'));
  }

  async deleteAnnouncement(req: Request, res: Response) : Promise<void> {
    const id = parseInt(req.params.id, 10);
    logAuditEvent(req, 'Announcement delete requested', {
      targetAnnouncementId: id,
    });
    await announcementService.deleteAnnouncement(id);
    res.status(200).json(successResponse(null, 'Announcement deleted successfully'));
  }
}
