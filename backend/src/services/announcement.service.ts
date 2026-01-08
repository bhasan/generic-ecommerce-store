import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';

export interface CreateAnnouncementData {
  message: string;
  type: 'INFO' | 'WARNING' | 'SUCCESS';
  dismissible?: boolean;
  enabled?: boolean;
}

export interface UpdateAnnouncementData {
  message?: string;
  type?: 'INFO' | 'WARNING' | 'SUCCESS';
  dismissible?: boolean;
  enabled?: boolean;
}

export class AnnouncementService {
  /**
   * Get all active (enabled) announcements
   * Public endpoint
   */
  async getActiveAnnouncements() {
    const announcements = await prisma.announcement.findMany({
      where: {
        enabled: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return announcements;
  }

  /**
   * Get all announcements
   * Admin only
   */
  async getAllAnnouncements() {
    const announcements = await prisma.announcement.findMany({
      orderBy: {
        createdAt: 'desc'
      }
    });

    return announcements;
  }

  /**
   * Get announcement by ID
   */
  async getAnnouncementById(id: number) {
    const announcement = await prisma.announcement.findUnique({
      where: { id }
    });

    if (!announcement) {
      throw new AppError('Announcement not found', 404);
    }

    return announcement;
  }

  /**
   * Create new announcement
   * Admin only
   */
  async createAnnouncement(data: CreateAnnouncementData) {
    if (!data.message || data.message.trim().length === 0) {
      throw new AppError('Message is required', 400);
    }

    const announcement = await prisma.announcement.create({
      data: {
        message: data.message.trim(),
        type: data.type || 'INFO',
        dismissible: data.dismissible !== undefined ? data.dismissible : true,
        enabled: data.enabled !== undefined ? data.enabled : true
      }
    });

    return announcement;
  }

  /**
   * Update announcement
   * Admin only
   */
  async updateAnnouncement(id: number, data: UpdateAnnouncementData) {
    // Check if announcement exists
    await this.getAnnouncementById(id);

    if (data.message !== undefined && data.message.trim().length === 0) {
      throw new AppError('Message cannot be empty', 400);
    }

    const updateData: any = {};
    if (data.message !== undefined) updateData.message = data.message.trim();
    if (data.type !== undefined) updateData.type = data.type;
    if (data.dismissible !== undefined) updateData.dismissible = data.dismissible;
    if (data.enabled !== undefined) updateData.enabled = data.enabled;

    const announcement = await prisma.announcement.update({
      where: { id },
      data: updateData
    });

    return announcement;
  }

  /**
   * Delete announcement
   * Admin only
   */
  async deleteAnnouncement(id: number) {
    // Check if announcement exists
    await this.getAnnouncementById(id);

    await prisma.announcement.delete({
      where: { id }
    });
  }
}

