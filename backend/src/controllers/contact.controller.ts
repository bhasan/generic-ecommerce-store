import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import emailService from '../services/email.service';
import contactMessageService from '../services/contactMessage.service';
import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import { notificationEventsService } from '../services/notificationEvents.service';

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
        logger.warn('Contact form validation failed', {
          requestId: req.requestId,
          actorUserId: req.user?.userId ?? null,
          errors: errors.array(),
        });
        res.status(400).json({ errors: errors.array() });
        return;
      }

      // Ensure user is authenticated
      if (!req.user) {
        logger.warn('Contact form rejected: unauthenticated request', {
          requestId: req.requestId,
        });
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

      // This is the controller-level handoff point between auth, persistence,
      // and outbound support workflows, so we keep a single correlation log here.
      logger.info('Contact form submitted', {
        requestId: req.requestId,
        actorUserId: userId,
        messageId: savedMessage.id,
        orderId: orderId ? parseInt(orderId, 10) : null,
        subject,
      });

      await notificationEventsService.notifyContactMessageReceived(savedMessage.id, {
        userId,
        username,
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
      logger.info('Contact messages fetched', {
        requestId: req.requestId,
        actorUserId: req.user?.userId ?? null,
        filters,
        count: messages.length,
      });
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
      logger.info('Contact message count fetched', {
        count,
      });
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
      logger.info('Contact message fetched', {
        requestId: req.requestId,
        actorUserId: req.user?.userId ?? null,
        messageId: parseInt(id, 10),
      });
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
        logger.warn('Contact message update validation failed', {
          requestId: req.requestId,
          actorUserId: req.user?.userId ?? null,
          targetMessageId: req.params.id,
          errors: errors.array(),
        });
        res.status(400).json({ errors: errors.array() });
        return;
      }

      const { id } = req.params;
      const { status, adminNotes } = req.body;

      const message = await contactMessageService.updateMessage(parseInt(id, 10), {
        status,
        adminNotes
      });

      logger.info('Contact message updated via controller', {
        requestId: req.requestId,
        actorUserId: req.user?.userId ?? null,
        messageId: parseInt(id, 10),
        status: status ?? null,
        hasAdminNotes: adminNotes !== undefined,
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
      logger.info('Contact message marked as read', {
        requestId: req.requestId,
        actorUserId: req.user?.userId ?? null,
        messageId: parseInt(id, 10),
      });
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
      logger.info('Contact message marked as resolved', {
        requestId: req.requestId,
        actorUserId: req.user?.userId ?? null,
        messageId: parseInt(id, 10),
      });
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
      logger.info('Contact message deleted via controller', {
        requestId: req.requestId,
        actorUserId: req.user?.userId ?? null,
        messageId: parseInt(id, 10),
      });
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
        logger.warn('Reply validation failed', {
          requestId: req.requestId,
          actorUserId: req.user?.userId ?? null,
          targetMessageId: req.params.id,
          errors: errors.array(),
        });
        res.status(400).json({ errors: errors.array() });
        return;
      }

      if (!req.user) {
        logger.warn('Reply rejected: unauthenticated request', {
          requestId: req.requestId,
          targetMessageId: req.params.id,
        });
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

      // Persist only reply metadata so the app can reflect support activity
      // without storing the sensitive reply body in the database.
      const updatedMessage = await contactMessageService.updateMessage(parseInt(id, 10), {
        status: 'RESOLVED',
        repliedAt: new Date(),
        repliedBy: userId,
        repliedByName: repliedByName,
      });

      logger.info('Reply state recorded', {
        messageId: id,
        repliedBy: userId,
        repliedByName: repliedByName,
        requestId: req.requestId,
      });

      await notificationEventsService.notifyContactReplySent(
        parseInt(id, 10),
        originalMessage.userId,
        {
          userId,
          username: repliedByName,
        }
      );

      let emailDelivered = false;
      let responseMessage = 'Reply sent successfully';

      if (!emailService.isReady()) {
        logger.warn('Reply recorded but email service is unavailable', {
          messageId: id,
          repliedBy: userId,
          customerEmail: originalMessage.userEmail,
          requestId: req.requestId,
        });
        responseMessage = 'Reply recorded, but email delivery is currently unavailable.';
      } else {
        try {
          // requestId/messageId are forwarded for debugging only; they must never
          // affect the webhook payload or the customer-visible reply behavior.
          await emailService.sendReplyEmail({
            type: 'reply',
            toEmail: originalMessage.userEmail,
            toName: originalMessage.userName,
            subject: originalMessage.subject,
            originalMessage: originalMessage.message,
            replyMessage: replyMessage,
            repliedBy: repliedByName,
            orderId: originalMessage.orderId,
          }, {
            requestId: req.requestId,
            actorUserId: userId,
            messageId: parseInt(id, 10),
          });

          emailDelivered = true;
        } catch (emailError) {
          logger.warn('Reply recorded but email delivery failed', {
            messageId: id,
            repliedBy: userId,
            customerEmail: originalMessage.userEmail,
            requestId: req.requestId,
            errorMessage: (emailError as Error).message,
          });
          responseMessage = 'Reply recorded, but email delivery failed.';
        }
      }

      logger.info('Reply sent successfully', {
        messageId: id,
        repliedBy: userId,
        repliedByName: repliedByName,
        customerEmail: originalMessage.userEmail,
        emailDelivered,
        requestId: req.requestId,
      });

      res.status(200).json({
        success: true,
        emailDelivered,
        message: responseMessage,
        data: updatedMessage
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new ContactController();
