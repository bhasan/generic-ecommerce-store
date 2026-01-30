import { logger } from '../utils/logger';
import { AppError } from '../middleware/error.middleware';

interface ContactEmailData {
  userName: string;
  userEmail: string;
  userPhone?: string;
  subject: string;
  orderId?: string | null;
  message: string;
}

interface ReplyEmailData {
  type: 'reply';
  toEmail: string;
  toName: string;
  subject: string;
  originalMessage: string;
  replyMessage: string;
  repliedBy: string;
  orderId?: number | null;
}

/**
 * Email Service
 * Sends contact form submissions via Make.com webhook
 */
export class EmailService {
  private webhookUrl: string | undefined;
  private apiKey: string | undefined;

  constructor() {
    this.webhookUrl = process.env.MAKE_WEBHOOK_URL;
    this.apiKey = process.env.MAKE_API_KEY;

    if (!this.webhookUrl || !this.apiKey) {
      logger.warn('Email service not configured. Missing MAKE_WEBHOOK_URL or MAKE_API_KEY environment variables.', {
        hasWebhookUrl: !!this.webhookUrl,
        hasApiKey: !!this.apiKey,
      });
    } else {
      logger.info('Email service initialized successfully (Make.com webhook)');
    }
  }

  /**
   * Check if email service is configured and ready
   */
  isReady(): boolean {
    return !!(this.webhookUrl && this.apiKey);
  }

  /**
   * Send a contact form submission via Make.com webhook
   */
  async sendContactEmail(data: ContactEmailData): Promise<boolean> {
    if (!this.isReady()) {
      logger.warn('Attempted to send contact email but webhook is not configured');
      throw new AppError('Email service is not configured', 503, 'EMAIL_NOT_CONFIGURED');
    }

    const payload = {
      userName: data.userName,
      userEmail: data.userEmail,
      userPhone: data.userPhone || null,
      subject: data.subject,
      orderId: data.orderId || null,
      message: data.message,
    };

    try {
      const response = await fetch(this.webhookUrl!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-make-apikey': this.apiKey!,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Make.com webhook returned error', new Error(errorText), {
          status: response.status,
          statusText: response.statusText,
        });
        throw new AppError('Failed to send contact form', 500, 'WEBHOOK_ERROR');
      }

      logger.info('Contact form sent successfully via Make.com webhook', {
        userName: data.userName,
        userEmail: data.userEmail,
        subject: data.subject,
        orderId: data.orderId,
      });

      return true;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      
      logger.error('Failed to send contact form via webhook', error as Error, {
        userName: data.userName,
        userEmail: data.userEmail,
        subject: data.subject,
      });
      throw new AppError('Failed to send contact form', 500, 'WEBHOOK_SEND_FAILED');
    }
  }

  /**
   * Send a reply email to customer via Make.com webhook
   */
  async sendReplyEmail(data: ReplyEmailData): Promise<boolean> {
    if (!this.isReady()) {
      logger.warn('Attempted to send reply email but webhook is not configured');
      throw new AppError('Email service is currently unavailable. Please try again later.', 503, 'EMAIL_SERVICE_UNAVAILABLE');
    }

    const payload = {
      type: 'reply',
      toEmail: data.toEmail,
      toName: data.toName,
      subject: `Re: ${data.subject}`,
      originalMessage: data.originalMessage,
      replyMessage: data.replyMessage,
      repliedBy: data.repliedBy,
      orderId: data.orderId || null,
    };

    try {
      const response = await fetch(this.webhookUrl!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-make-apikey': this.apiKey!,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Make.com webhook returned error for reply', new Error(errorText), {
          status: response.status,
          statusText: response.statusText,
        });
        throw new AppError('Failed to send reply email', 500, 'WEBHOOK_ERROR');
      }

      logger.info('Reply email sent successfully via Make.com webhook', {
        toEmail: data.toEmail,
        toName: data.toName,
        subject: data.subject,
        repliedBy: data.repliedBy,
      });

      return true;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      
      logger.error('Failed to send reply email via webhook', error as Error, {
        toEmail: data.toEmail,
        toName: data.toName,
        subject: data.subject,
      });
      throw new AppError('Failed to send reply email', 500, 'WEBHOOK_SEND_FAILED');
    }
  }
}

export default new EmailService();
