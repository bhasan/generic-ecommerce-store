import {
  NotificationCategory,
  NotificationDeliveryStatus,
  NotificationType,
} from '../../generated/prisma';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/error.middleware';
import { notificationService } from './notification.service';

interface DeliveryPayload {
  eventType: NotificationType;
  category: NotificationCategory;
  channelIntent: 'email' | 'ops_alert' | 'in_app_sync';
  notificationId: number;
  occurredAt: string;
  recipient: {
    userId: number;
  };
  targetRoles?: string[] | null;
  actor?: {
    userId?: number | null;
    username?: string | null;
  };
  entity?: {
    type?: string | null;
    id?: number | null;
  };
  message: {
    title: string;
    body: string;
  };
  status?: string | null;
  path?: string | null;
  requiresAttention?: boolean;
  metadata?: Record<string, unknown> | null;
}

const CATEGORY_ENV_MAP: Record<NotificationCategory, string> = {
  ORDERS: 'MAKE_NOTIFICATION_WEBHOOK_URL_ORDERS',
  AUTH: 'MAKE_NOTIFICATION_WEBHOOK_URL_AUTH',
  CONTACT: 'MAKE_NOTIFICATION_WEBHOOK_URL_CONTACT',
  DRIVER: 'MAKE_NOTIFICATION_WEBHOOK_URL_DRIVER',
  ADMIN: 'MAKE_NOTIFICATION_WEBHOOK_URL_ADMIN',
};

export class NotificationDeliveryService {
  private apiKey = process.env.MAKE_API_KEY;

  resolveWebhookUrl(category: NotificationCategory) {
    const categoryKey = CATEGORY_ENV_MAP[category];
    return process.env[categoryKey]
      || process.env.MAKE_NOTIFICATION_WEBHOOK_URL
      || process.env.MAKE_WEBHOOK_URL
      || '';
  }

  isConfigured(category: NotificationCategory) {
    return Boolean(this.resolveWebhookUrl(category) && this.apiKey);
  }

  async deliver(
    payloads: DeliveryPayload[],
    category: NotificationCategory,
  ) {
    if (payloads.length === 0) return;

    const webhookUrl = this.resolveWebhookUrl(category);
    if (!webhookUrl || !this.apiKey) {
      await notificationService.updateDeliveryStatus(
        payloads.map((payload) => payload.notificationId),
        NotificationDeliveryStatus.DISABLED,
      );
      logger.warn('Notification delivery disabled for category', {
        category,
        hasWebhookUrl: Boolean(webhookUrl),
        hasApiKey: Boolean(this.apiKey),
      });
      return;
    }

    try {
      await Promise.all(payloads.map(async (payload) => {
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-make-apikey': this.apiKey!,
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new AppError(errorText || 'Notification webhook failed', response.status, 'WEBHOOK_ERROR');
        }
      }));

      await notificationService.updateDeliveryStatus(
        payloads.map((payload) => payload.notificationId),
        NotificationDeliveryStatus.DELIVERED,
      );

      logger.info('Notifications delivered to Make webhook', {
        category,
        count: payloads.length,
      });
    } catch (error) {
      await notificationService.updateDeliveryStatus(
        payloads.map((payload) => payload.notificationId),
        NotificationDeliveryStatus.FAILED,
      );

      logger.error('Notification delivery failed', error as Error, {
        category,
        count: payloads.length,
      });
    }
  }
}

export const notificationDeliveryService = new NotificationDeliveryService();
