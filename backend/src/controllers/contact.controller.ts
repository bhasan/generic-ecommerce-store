import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import emailService from '../services/email.service';
import contactMessageService from '../services/contactMessage.service';
import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';

export class ContactController {
  /**
   * Submit a contact form
   * POST /api/contact
   */
  async submitContactForm(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      // Ensure user is authenticated
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const { subject, orderId, message } = req.body;
      const { userId, username } = req.user;

      // Fetch additional user info from database
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { phoneNumber: true }
      });

      const phoneNumber = user?.phoneNumber || undefined;

      // Save message to database
      const savedMessage = await contactMessageService.createMessage({
        userId,
        userName: username,
        userEmail: username,
        userPhone: phoneNumber,
        subject,
        orderId: orderId ? parseInt(orderId, 10) : null,
        message
      });


      res.status(200).json({
        success: true,
        message: 'Your message has been sent successfully. We will get back to you soon.',
        messageId: savedMessage.id
      });
    } catch (error) {
      logger.error('submitContactForm: ERROR', error as Error, {
        requestId: req.requestId,
        userId: req.user?.userId,
        body: req.body
      });
      next(error);
    }
  }

  /**
   * Get all contact messages
   * GET /api/contact/messages
   * Admin/Manager only
   */
  async getAllMessages(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { status } = req.query;

      const filters: any = {};
      if (status && ['NEW', 'READ', 'RESOLVED'].includes(status as string)) {
        filters.status = status as string;
      }

      const messages = await contactMessageService.getAllMessages(filters);
      res.status(200).json(messages);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get new message count
   * GET /api/contact/messages/count
   * Admin/Manager only
   */
  async getNewMessageCount(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const count = await contactMessageService.getNewMessageCount();
      res.status(200).json({ count });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get single message by ID
   * GET /api/contact/messages/:id
   * Admin/Manager only
   */
  async getMessageById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const message = await contactMessageService.getMessageById(parseInt(id, 10));
      res.status(200).json(message);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update message status/notes
   * PATCH /api/contact/messages/:id
   * Admin/Manager only
   */
  async updateMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      const { id } = req.params;
      const { status, adminNotes } = req.body;

      const message = await contactMessageService.updateMessage(parseInt(id, 10), {
        status,
        adminNotes
      });

      res.status(200).json(message);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Mark message as read
   * PATCH /api/contact/messages/:id/read
   * Admin/Manager only
   */
  async markAsRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const message = await contactMessageService.markAsRead(parseInt(id, 10));
      res.status(200).json(message);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Mark message as resolved
   * PATCH /api/contact/messages/:id/resolve
   * Admin/Manager only
   */
  async markAsResolved(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const message = await contactMessageService.markAsResolved(parseInt(id, 10));
      res.status(200).json(message);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete message
   * DELETE /api/contact/messages/:id
   * Admin only
   */
  async deleteMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      await contactMessageService.deleteMessage(parseInt(id, 10));
      res.status(200).json({ success: true, message: 'Message deleted successfully' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Reply to a message (sends email to customer)
   * POST /api/contact/messages/:id/reply
   * Admin/Manager only
   */
  async replyToMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const { id } = req.params;
      const { replyMessage } = req.body;
      const { userId } = req.user;

      // Get the original message
      const originalMessage = await contactMessageService.getMessageById(parseInt(id, 10));

      // Check if already replied
      if (originalMessage.repliedAt) {
        throw new AppError('This message has already been replied to', 400, 'ALREADY_REPLIED');
      }

      // Get admin/manager username
      const adminUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { username: true }
      });
      const repliedByName = adminUser?.username || 'Support Team';

      // Check if email service is ready
      if (!emailService.isReady()) {
        throw new AppError('Email service is currently unavailable. Please try again later.', 503, 'EMAIL_SERVICE_UNAVAILABLE');
      }

      // Send reply email via Make.com webhook
      await emailService.sendReplyEmail({
        type: 'reply',
        toEmail: originalMessage.userEmail,
        toName: originalMessage.userName,
        subject: originalMessage.subject,
        originalMessage: originalMessage.message,
        replyMessage: replyMessage,
        repliedBy: repliedByName,
        orderId: originalMessage.orderId,
      });

      // Update the message with reply details and mark as resolved
      const updatedMessage = await contactMessageService.updateMessage(parseInt(id, 10), {
        status: 'RESOLVED',
        replyMessage: replyMessage,
        repliedAt: new Date(),
        repliedBy: userId,
        repliedByName: repliedByName,
      });

      logger.info('Reply sent successfully', {
        messageId: id,
        repliedBy: userId,
        repliedByName: repliedByName,
        customerEmail: originalMessage.userEmail,
        requestId: req.requestId,
      });

      res.status(200).json({
        success: true,
        message: 'Reply sent successfully',
        data: updatedMessage
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new ContactController();
