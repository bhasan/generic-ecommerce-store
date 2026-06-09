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
    delete (global as any).fetch;
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

  it('delivers an ORDER_CREATED ops_alert payload to make', async () => {
    process.env.MAKE_NOTIFICATION_WEBHOOK_URL = 'https://default.example/webhook';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue('Accepted'),
    } as any);
    (global as any).fetch = fetchMock;

    const { NotificationDeliveryService } = await import('./notificationDelivery.service');
    const service = new NotificationDeliveryService();
    const payload = {
      eventType: 'ORDER_CREATED',
      category: 'ORDERS',
      channelIntent: 'ops_alert',
      notificationId: 123,
      occurredAt: '2026-04-12T18:00:00.000Z',
      recipient: { userId: 45 },
      targetRoles: ['EMPLOYEE', 'MANAGEMENT', 'ADMIN'],
      actor: { userId: 12, username: 'customer@example.com' },
      entity: { type: 'ORDER', id: 987 },
      message: {
        title: 'New order submitted',
        body: 'Order #987 is waiting for review.',
      },
      status: 'PENDING',
      path: '/orders?status=PENDING',
      requiresAttention: true,
      metadata: {
        orderId: 987,
        path: '/orders?status=PENDING',
        label: 'Review order',
      },
    };

    await service.deliver([payload as any], 'ORDERS');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('https://default.example/webhook', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        'Content-Type': 'application/json',
        'x-make-apikey': 'test-api-key',
      }),
    }));
    const request = fetchMock.mock.calls[0][1] as { body: string };
    expect(JSON.parse(request.body)).toEqual(payload);
    expect(notificationService.updateDeliveryStatus).toHaveBeenCalledWith([123], 'DELIVERED');
  });

  it('marks all grouped notification ids delivered when deduped payloads are sent', async () => {
    process.env.MAKE_NOTIFICATION_WEBHOOK_URL = 'https://default.example/webhook';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue('Accepted'),
    } as any);
    (global as any).fetch = fetchMock;

    const { NotificationDeliveryService } = await import('./notificationDelivery.service');
    const service = new NotificationDeliveryService();
    const payload = {
      eventType: 'ORDER_CREATED',
      category: 'ORDERS',
      channelIntent: 'ops_alert',
      notificationId: 301,
      notificationIds: [301, 302, 303],
      occurredAt: '2026-04-12T18:00:00.000Z',
      recipient: { userId: 45 },
      message: {
        title: 'New order submitted',
        body: 'Order #987 is waiting for review.',
      },
      metadata: {
        destinationEmail: 'admin@example.com',
      },
    };

    await service.deliver([payload as any], 'ORDERS');

    expect(notificationService.updateDeliveryStatus).toHaveBeenCalledWith([301, 302, 303], 'DELIVERED');
  });

  it('delivers an email payload that includes userEmail for customer routing', async () => {
    process.env.MAKE_NOTIFICATION_WEBHOOK_URL = 'https://default.example/webhook';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue('Accepted'),
    } as any);
    (global as any).fetch = fetchMock;

    const { NotificationDeliveryService } = await import('./notificationDelivery.service');
    const service = new NotificationDeliveryService();
    const payload = {
      eventType: 'CONTACT_REPLY_SENT',
      category: 'CONTACT',
      channelIntent: 'email',
      notificationId: 224,
      occurredAt: '2026-04-12T18:00:00.000Z',
      recipient: { userId: 55 },
      message: {
        title: 'Support replied',
        body: 'We replied to your support message.',
      },
      metadata: {
        userEmail: 'customer@example.com',
        adminEmail: 'support@example.com',
        path: '/help',
      },
    };

    await service.deliver([payload as any], 'CONTACT');

    const request = fetchMock.mock.calls[0][1] as { body: string };
    const sentPayload = JSON.parse(request.body);
    expect(sentPayload.channelIntent).toBe('email');
    expect(sentPayload.metadata.userEmail).toBe('customer@example.com');
    expect(sentPayload.metadata.adminEmail).toBe('support@example.com');
    expect(notificationService.updateDeliveryStatus).toHaveBeenCalledWith([224], 'DELIVERED');
  });

  it('delivers a reply payload with metadata.type and metadata.toEmail', async () => {
    process.env.MAKE_NOTIFICATION_WEBHOOK_URL = 'https://default.example/webhook';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue('Accepted'),
    } as any);
    (global as any).fetch = fetchMock;

    const { NotificationDeliveryService } = await import('./notificationDelivery.service');
    const service = new NotificationDeliveryService();
    const payload = {
      eventType: 'CONTACT_REPLY_SENT',
      category: 'CONTACT',
      channelIntent: 'email',
      notificationId: 225,
      occurredAt: '2026-04-12T18:00:00.000Z',
      recipient: { userId: 55 },
      message: {
        title: 'Support replied',
        body: 'We replied to your support message.',
      },
      metadata: {
        type: 'reply',
        toEmail: 'customer@example.com',
        adminEmail: 'support@example.com',
      },
    };

    await service.deliver([payload as any], 'CONTACT');

    const request = fetchMock.mock.calls[0][1] as { body: string };
    const sentPayload = JSON.parse(request.body);
    expect(sentPayload.metadata.type).toBe('reply');
    expect(sentPayload.metadata.toEmail).toBe('customer@example.com');
    expect(sentPayload.metadata.adminEmail).toBe('support@example.com');
    expect(notificationService.updateDeliveryStatus).toHaveBeenCalledWith([225], 'DELIVERED');
  });

  it('marks delivery failed for malformed payloads so make can route fallback handling', async () => {
    process.env.MAKE_NOTIFICATION_WEBHOOK_URL = 'https://default.example/webhook';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: vi.fn().mockResolvedValue('Malformed payload'),
    } as any);
    (global as any).fetch = fetchMock;

    const { NotificationDeliveryService } = await import('./notificationDelivery.service');
    const service = new NotificationDeliveryService();
    const malformedPayload = {
      notificationId: 999,
      metadata: {
        unexpected: true,
      },
    };

    await service.deliver([malformedPayload as any], 'CONTACT');

    expect(notificationService.updateDeliveryStatus).toHaveBeenCalledWith([999], 'FAILED');
    expect(logger.error).toHaveBeenCalledWith(
      'Notification delivery failed',
      expect.any(Error),
      expect.objectContaining({
        category: 'CONTACT',
        count: 1,
      })
    );
  });
});
