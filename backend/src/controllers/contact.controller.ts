import { Request, Response } from 'express';
import emailService from '../services/email.service';
import contactMessageService from '../services/contactMessage.service';
import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import { notificationEventsService } from '../services/notificationEvents.service';
import { validateRequest } from '../utils/request.util';
import { successResponse } from '../utils/responseEnvelope';

export class ContactController {
  async submitContactForm(req: Request, res: Response) : Promise<void> {
    if (!validateRequest(req, res)) return;
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { subject, orderId, message } = req.body;
    const { userId, username } = req.user;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { phoneNumber: true },
    });

    const parsedOrderId = orderId ? parseInt(orderId, 10) : null;
    const savedMessage = await contactMessageService.createMessage({
      userId,
      userName: username,
      userEmail: username,
      userPhone: user?.phoneNumber || undefined,
      subject,
      orderId: parsedOrderId,
      message,
    });

    // This is the controller-level handoff point between auth, persistence,
    // and outbound support workflows, so we keep a single correlation log here.
    logger.info('Contact form submitted', {
      requestId: req.requestId,
      actorUserId: userId,
      messageId: savedMessage.id,
      orderId: parsedOrderId,
      subject,
    });

    notificationEventsService.notifyContactMessageReceived(savedMessage.id, { userId, username })
      .catch(err => logger.error('notifyContactMessageReceived failed', err as Error, {
        userId,
        messageId: savedMessage.id,
      }));

    res.status(200).json(successResponse(
      { messageId: savedMessage.id },
      'Your message has been sent successfully. We will get back to you soon.',
    ));
  }

  async getAllMessages(req: Request, res: Response) : Promise<void> {
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
    res.status(200).json(successResponse(messages));
  }

  async getNewMessageCount(_req: Request, res: Response) : Promise<void> {
    const count = await contactMessageService.getNewMessageCount();
    res.status(200).json(successResponse({ count }));
  }

  async getMessageById(req: Request, res: Response) : Promise<void> {
    const id = parseInt(req.params.id, 10);
    const message = await contactMessageService.getMessageById(id);
    res.status(200).json(successResponse(message));
  }

  async updateMessage(req: Request, res: Response) : Promise<void> {
    if (!validateRequest(req, res)) return;
    const id = parseInt(req.params.id, 10);
    const { status, adminNotes } = req.body;
    const message = await contactMessageService.updateMessage(id, { status, adminNotes });
    logger.info('Contact message updated via controller', {
      requestId: req.requestId,
      actorUserId: req.user?.userId ?? null,
      messageId: id,
      status: status ?? null,
      hasAdminNotes: adminNotes !== undefined,
    });
    res.status(200).json(successResponse(message));
  }

  async markAsRead(req: Request, res: Response) : Promise<void> {
    const id = parseInt(req.params.id, 10);
    const message = await contactMessageService.markAsRead(id);
    res.status(200).json(successResponse(message));
  }

  async markAsResolved(req: Request, res: Response) : Promise<void> {
    const id = parseInt(req.params.id, 10);
    const message = await contactMessageService.markAsResolved(id);
    res.status(200).json(successResponse(message));
  }

  async deleteMessage(req: Request, res: Response) : Promise<void> {
    const id = parseInt(req.params.id, 10);
    await contactMessageService.deleteMessage(id);
    res.status(200).json(successResponse(null, 'Message deleted successfully'));
  }

  async replyToMessage(req: Request, res: Response) : Promise<void> {
    if (!validateRequest(req, res)) return;
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const id = parseInt(req.params.id, 10);
    const { replyMessage } = req.body;
    const { userId } = req.user;

    const originalMessage = await contactMessageService.getMessageById(id);

    if (originalMessage.repliedAt) {
      throw new AppError('This message has already been replied to', 400, 'ALREADY_REPLIED');
    }

    const adminUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true },
    });
    const repliedByName = adminUser?.username || 'Support Team';

    // Persist only reply metadata so the app can reflect support activity
    // without storing the sensitive reply body in the database.
    const updatedMessage = await contactMessageService.updateMessage(id, {
      status: 'RESOLVED',
      repliedAt: new Date(),
      repliedBy: userId,
      repliedByName,
    });

    logger.info('Reply state recorded', {
      messageId: id,
      repliedBy: userId,
      repliedByName,
      requestId: req.requestId,
    });

    // This in-app notification updates the customer's support inbox state.
    // Skipped when the original sender's account was since deleted (userId nulled).
    // Outbound customer email delivery is handled separately by emailService below.
    if (originalMessage.userId !== null) {
      await notificationEventsService.notifyContactReplySent(id, originalMessage.userId, {
        userId,
        username: repliedByName,
      });
    }

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
          replyMessage,
          repliedBy: repliedByName,
          orderId: originalMessage.orderId,
        }, {
          requestId: req.requestId,
          actorUserId: userId,
          messageId: id,
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
      repliedByName,
      customerEmail: originalMessage.userEmail,
      emailDelivered,
      requestId: req.requestId,
    });

    res.status(200).json(successResponse({ emailDelivered, updatedMessage }, responseMessage));
  }
}

export default new ContactController();
