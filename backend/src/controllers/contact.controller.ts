import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import emailService from '../services/email.service';
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
      const { userId, email } = req.user;

      // Fetch additional user info from database
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, phoneNumber: true }
      });

      const name = user?.name || 'Customer';
      const phoneNumber = user?.phoneNumber || undefined;

      // Check if email service is configured
      if (!emailService.isReady()) {
        logger.warn('Contact form submission failed: Email service not configured', {
          userId,
          subject,
          orderId,
        });
        throw new AppError(
          'Email service is currently unavailable. Please try calling or visiting our store.',
          503,
          'EMAIL_SERVICE_UNAVAILABLE'
        );
      }

      // Send the contact email
      await emailService.sendContactEmail({
        userName: name || 'Customer',
        userEmail: email,
        userPhone: phoneNumber,
        subject,
        orderId: orderId || null,
        message,
      });

      logger.info('Contact form submitted successfully', {
        userId,
        userEmail: email,
        subject,
        orderId,
        requestId: req.requestId,
      });

      res.status(200).json({
        success: true,
        message: 'Your message has been sent successfully. We will get back to you soon.',
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new ContactController();
