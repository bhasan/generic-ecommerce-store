import { beforeEach, describe, expect, it, vi } from 'vitest';

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

const notificationService = {
  updateDeliveryStatus: vi.fn(),
};

vi.mock('../utils/logger', () => ({
  logger,
}));

vi.mock('./notification.service', () => ({
  notificationService,
}));

describe('notification delivery service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.MAKE_NOTIFICATION_WEBHOOK_URL;
    delete process.env.MAKE_NOTIFICATION_WEBHOOK_URL_ORDERS;
    delete process.env.MAKE_WEBHOOK_URL;
    process.env.MAKE_API_KEY = 'test-api-key';
  });

  it('prefers category-specific webhook urls over the default', async () => {
    process.env.MAKE_NOTIFICATION_WEBHOOK_URL = 'https://default.example/webhook';
    process.env.MAKE_NOTIFICATION_WEBHOOK_URL_ORDERS = 'https://orders.example/webhook';
    const { NotificationDeliveryService } = await import('./notificationDelivery.service');
    const service = new NotificationDeliveryService();

    expect(service.resolveWebhookUrl('ORDERS')).toBe('https://orders.example/webhook');
    expect(service.resolveWebhookUrl('AUTH')).toBe('https://default.example/webhook');
  });

  it('falls back to the shared make webhook when notification webhook envs are unset', async () => {
    process.env.MAKE_WEBHOOK_URL = 'https://shared.example/webhook';
    const { NotificationDeliveryService } = await import('./notificationDelivery.service');
    const service = new NotificationDeliveryService();

    expect(service.resolveWebhookUrl('CONTACT')).toBe('https://shared.example/webhook');
  });

  it('marks notifications as disabled when no webhook url is configured', async () => {
    const { NotificationDeliveryService } = await import('./notificationDelivery.service');
    const service = new NotificationDeliveryService();

    await service.deliver([
      {
        eventType: 'ORDER_CREATED',
        category: 'ORDERS',
        channelIntent: 'ops_alert',
        notificationId: 12,
        occurredAt: new Date().toISOString(),
        recipient: { userId: 9 },
        message: { title: 'New order', body: 'Order #12 is waiting.' },
      },
    ], 'ORDERS');

    expect(notificationService.updateDeliveryStatus).toHaveBeenCalledWith([12], 'DISABLED');
  });
});
