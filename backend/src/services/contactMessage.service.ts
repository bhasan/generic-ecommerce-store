import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';

export type ContactMessageStatus = 'NEW' | 'READ' | 'RESOLVED';

export interface CreateContactMessageData {
  userId: number;
  userName: string;
  userEmail: string;
  userPhone?: string;
  subject: string;
  orderId?: number | null;
  message: string;
}

export interface UpdateContactMessageData {
  status?: ContactMessageStatus;
  adminNotes?: string;
  replyMessage?: string;
  repliedAt?: Date;
  repliedBy?: number;
  repliedByName?: string;
}

export interface ContactMessageFilters {
  status?: ContactMessageStatus;
  userId?: number;
}

export class ContactMessageService {
  /**
   * Get all contact messages (with optional filters)
   * Admin/Manager only
   */
  async getAllMessages(filters?: ContactMessageFilters) {
    const where: any = {};

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.userId) {
      where.userId = filters.userId;
    }

    const messages = await prisma.contactMessage.findMany({
      where,
      orderBy: [
        { status: 'asc' }, // NEW first, then READ, then RESOLVED
        { createdAt: 'desc' }
      ]
    });

    return messages;
  }

  /**
   * Get count of new (unread) messages
   * For badge display
   */
  async getNewMessageCount(): Promise<number> {
    const count = await prisma.contactMessage.count({
      where: {
        status: 'NEW'
      }
    });

    return count;
  }

  /**
   * Get message by ID
   */
  async getMessageById(id: number) {
    const message = await prisma.contactMessage.findUnique({
      where: { id }
    });

    if (!message) {
      throw new AppError('Contact message not found', 404);
    }

    return message;
  }

  /**
   * Create a new contact message
   */
  async createMessage(data: CreateContactMessageData) {
    if (!data.message || data.message.trim().length === 0) {
      throw new AppError('Message is required', 400);
    }

    if (!data.subject || data.subject.trim().length === 0) {
      throw new AppError('Subject is required', 400);
    }

    const message = await prisma.contactMessage.create({
      data: {
        userId: data.userId,
        userName: data.userName,
        userEmail: data.userEmail,
        userPhone: data.userPhone || null,
        subject: data.subject,
        orderId: data.orderId || null,
        message: data.message.trim(),
        status: 'NEW'
      }
    });

    logger.info('Contact message created', {
      messageId: message.id,
      userId: data.userId,
      subject: data.subject
    });

    return message;
  }

  /**
   * Update message status and/or admin notes
   * Admin/Manager only
   */
  async updateMessage(id: number, data: UpdateContactMessageData) {
    // Check if message exists
    await this.getMessageById(id);

    const updateData: any = {};
    if (data.status !== undefined) updateData.status = data.status;
    if (data.adminNotes !== undefined) updateData.adminNotes = data.adminNotes;
    if (data.replyMessage !== undefined) updateData.replyMessage = data.replyMessage;
    if (data.repliedAt !== undefined) updateData.repliedAt = data.repliedAt;
    if (data.repliedBy !== undefined) updateData.repliedBy = data.repliedBy;
    if (data.repliedByName !== undefined) updateData.repliedByName = data.repliedByName;

    const message = await prisma.contactMessage.update({
      where: { id },
      data: updateData
    });

    logger.info('Contact message updated', {
      messageId: id,
      status: data.status,
      hasAdminNotes: !!data.adminNotes,
      hasReply: !!data.replyMessage
    });

    return message;
  }

  /**
   * Mark message as read
   * Admin/Manager only
   */
  async markAsRead(id: number) {
    return this.updateMessage(id, { status: 'READ' });
  }

  /**
   * Mark message as resolved
   * Admin/Manager only
   */
  async markAsResolved(id: number) {
    return this.updateMessage(id, { status: 'RESOLVED' });
  }

  /**
   * Delete message
   * Admin only
   */
  async deleteMessage(id: number) {
    // Check if message exists
    await this.getMessageById(id);

    await prisma.contactMessage.delete({
      where: { id }
    });

    logger.info('Contact message deleted', { messageId: id });
  }
}

export default new ContactMessageService();
