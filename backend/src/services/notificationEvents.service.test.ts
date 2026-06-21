import { describe, it, expect, beforeEach, vi } from 'vitest';
const notificationService = {
  createNotifications: vi.fn(),
  updateDeliveryStatus: vi.fn(),
  getRecipientRolesForUsers: vi.fn(),
};

const notificationDeliveryService = {
  deliver: vi.fn(),
};

const storeSettingsService = {
  getNotificationEmailRouting: vi.fn(),
};

vi.mock('./notification.service', () => ({
  notificationService,
}));

vi.mock('./notificationDelivery.service', () => ({
  notificationDeliveryService,
}));

vi.mock('./storeSettings.service', () => ({
  StoreSettingsService: vi.fn(() => storeSettingsService),
}));

describe('notification events service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeSettingsService.getNotificationEmailRouting.mockResolvedValue({
      adminEmail: 'admin@example.com',
      managementEmail: 'manager@example.com',
      employeeEmail: 'employee@example.com',
    });
    notificationService.getRecipientRolesForUsers.mockResolvedValue(new Map());
  });

  it('delivers created notification records through the delivery service', async () => {
    notificationService.createNotifications.mockResolvedValue([
      {
        id: 8,
        type: 'ORDER_CREATED',
        category: 'ORDERS',
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        recipientUserId: 21,
        sourceEntityType: 'ORDER',
        sourceEntityId: 44,
        title: 'New order submitted',
        message: 'Order #44 is waiting for review.',
        metadata: { path: '/orders?status=PENDING' },
        requiresAttention: true,
      },
    ]);

    const { NotificationEventsService } = await import('./notificationEvents.service');
    const service = new NotificationEventsService();
    notificationService.getRecipientRolesForUsers.mockResolvedValue(new Map([[21, ['ADMIN']]]));

    await service.notifyOrderCreated(44, 99);

    expect(notificationService.createNotifications).toHaveBeenCalledWith(expect.objectContaining({
      type: 'ORDER_CREATED',
      category: 'ORDERS',
      sourceEntityId: 44,
      requiresAttention: true,
    }));
    expect(notificationDeliveryService.deliver).toHaveBeenCalledWith([
      expect.objectContaining({
        eventType: 'ORDER_CREATED',
        channelIntent: 'ops_alert',
        notificationId: 8,
        recipient: { userId: 21 },
        targetRoles: ['EMPLOYEE', 'MANAGEMENT', 'ADMIN'],
        actor: { userId: 99, username: null },
        path: '/orders?status=PENDING',
        requiresAttention: true,
        metadata: expect.objectContaining({
          recipientRole: 'ADMIN',
          destinationEmail: 'admin@example.com',
        }),
      }),
    ], 'ORDERS');
  });

  it('emits both customer and driver-facing updates for ready-for-delivery orders', async () => {
    notificationService.createNotifications.mockResolvedValue([]);

    const { NotificationEventsService } = await import('./notificationEvents.service');
    const service = new NotificationEventsService();
    const emitSpy = vi.spyOn(service, 'emit').mockResolvedValue([]);

    await service.notifyOrderStatusUpdated(52, 7, 'READY_FOR_DELIVERY', 'APPROVED');

    expect(emitSpy).toHaveBeenCalledTimes(2);
    expect(emitSpy).toHaveBeenNthCalledWith(1, expect.objectContaining({
      recipientUserIds: [7],
      requiresAttention: false,
      channelIntent: 'in_app_sync',
      sendToMake: true,
      metadata: expect.objectContaining({
        status: 'READY_FOR_DELIVERY',
        previousStatus: 'APPROVED',
      }),
    }));
    expect(emitSpy).toHaveBeenNthCalledWith(2, expect.objectContaining({
      category: 'DRIVER',
      recipientRoles: ['DELIVERY_DRIVER', 'MANAGEMENT', 'ADMIN'],
      requiresAttention: true,
      channelIntent: 'ops_alert',
      sendToMake: true,
    }));
  });

  it('keeps approved customer updates in-app only', async () => {
    const { NotificationEventsService } = await import('./notificationEvents.service');
    const service = new NotificationEventsService();
    const emitSpy = vi.spyOn(service, 'emit').mockResolvedValue([]);

    await service.notifyOrderStatusUpdated(52, 7, 'APPROVED', 'PENDING');

    expect(emitSpy).toHaveBeenCalledTimes(1);
    expect(emitSpy).toHaveBeenCalledWith(expect.objectContaining({
      recipientUserIds: [7],
      requiresAttention: false,
      channelIntent: 'in_app_sync',
      sendToMake: false,
      metadata: expect.objectContaining({
        status: 'APPROVED',
        path: '/orders',
      }),
    }));
  });

  it('marks rejection and support-reply notifications as urgent while keeping replies in-app only', async () => {
    const { NotificationEventsService } = await import('./notificationEvents.service');
    const service = new NotificationEventsService();
    const emitSpy = vi.spyOn(service, 'emit').mockResolvedValue([]);

    await service.notifyAccountRejected(31);
    await service.notifyContactReplySent(9, 31, { userId: 5, username: 'manager' });

    expect(emitSpy).toHaveBeenNthCalledWith(1, expect.objectContaining({
      type: 'ACCOUNT_REJECTED',
      recipientUserIds: [31],
      requiresAttention: true,
      channelIntent: 'in_app_sync',
    }));
    expect(emitSpy).toHaveBeenNthCalledWith(2, expect.objectContaining({
      type: 'CONTACT_REPLY_SENT',
      recipientUserIds: [31],
      requiresAttention: true,
      channelIntent: 'in_app_sync',
      sendToMake: false,
      metadata: expect.objectContaining({
        path: '/help',
      }),
    }));
  });

  it('adds delivered visibility for management and admin without sending to make', async () => {
    const { NotificationEventsService } = await import('./notificationEvents.service');
    const service = new NotificationEventsService();
    const emitSpy = vi.spyOn(service, 'emit').mockResolvedValue([]);

    await service.notifyOrderStatusUpdated(88, 12, 'DELIVERED', 'OUT_FOR_DELIVERY');

    expect(emitSpy).toHaveBeenCalledTimes(2);
    expect(emitSpy).toHaveBeenNthCalledWith(2, expect.objectContaining({
      category: 'ADMIN',
      recipientRoles: ['MANAGEMENT', 'ADMIN'],
      metadata: expect.objectContaining({
        status: 'DELIVERED',
        path: '/orders',
      }),
    }));
  });

  it('skips make delivery for email-intent payloads missing a destination email and marks them disabled', async () => {
    notificationService.createNotifications.mockResolvedValue([
      {
        id: 91,
        type: 'CONTACT_REPLY_SENT',
        category: 'CONTACT',
        createdAt: new Date('2026-04-12T00:00:00.000Z'),
        recipientUserId: 45,
        sourceEntityType: 'CONTACT_MESSAGE',
        sourceEntityId: 5001,
        title: 'Support replied',
        message: 'We replied to your support message.',
        metadata: { path: '/help' },
        requiresAttention: true,
      },
    ]);

    const { NotificationEventsService } = await import('./notificationEvents.service');
    const service = new NotificationEventsService();

    await service.emit({
      type: 'CONTACT_REPLY_SENT',
      category: 'CONTACT',
      title: 'Support replied',
      message: 'We replied to your support message.',
      recipientUserIds: [45],
      sourceEntityType: 'CONTACT_MESSAGE',
      sourceEntityId: 5001,
      channelIntent: 'email',
      sendToMake: true,
      metadata: { path: '/help' },
    });

    expect(notificationDeliveryService.deliver).not.toHaveBeenCalled();
    expect(notificationService.updateDeliveryStatus).toHaveBeenCalledWith([91], 'DISABLED');
  });

  it('delivers email-intent payloads when metadata contains userEmail', async () => {
    notificationService.createNotifications.mockResolvedValue([
      {
        id: 92,
        type: 'CONTACT_REPLY_SENT',
        category: 'CONTACT',
        createdAt: new Date('2026-04-12T00:00:00.000Z'),
        recipientUserId: 45,
        sourceEntityType: 'CONTACT_MESSAGE',
        sourceEntityId: 5002,
        title: 'Support replied',
        message: 'We replied to your support message.',
        metadata: { path: '/help', userEmail: 'customer@example.com' },
        requiresAttention: true,
      },
    ]);

    const { NotificationEventsService } = await import('./notificationEvents.service');
    const service = new NotificationEventsService();

    await service.emit({
      type: 'CONTACT_REPLY_SENT',
      category: 'CONTACT',
      title: 'Support replied',
      message: 'We replied to your support message.',
      recipientUserIds: [45],
      sourceEntityType: 'CONTACT_MESSAGE',
      sourceEntityId: 5002,
      channelIntent: 'email',
      sendToMake: true,
      metadata: { path: '/help', userEmail: 'customer@example.com' },
    });

    expect(notificationDeliveryService.deliver).toHaveBeenCalledWith([
      expect.objectContaining({
        eventType: 'CONTACT_REPLY_SENT',
        category: 'CONTACT',
        channelIntent: 'email',
        notificationId: 92,
        metadata: expect.objectContaining({
          userEmail: 'customer@example.com',
        }),
      }),
    ], 'CONTACT');
    expect(notificationService.updateDeliveryStatus).not.toHaveBeenCalled();
  });

  it('keeps fanout notifications in-app while deduping ops alerts that resolve to the same destination inbox', async () => {
    notificationService.createNotifications.mockResolvedValue([
      {
        id: 301,
        type: 'ORDER_CREATED',
        category: 'ORDERS',
        createdAt: new Date('2026-04-12T00:00:00.000Z'),
        recipientUserId: 42,
        sourceEntityType: 'ORDER',
        sourceEntityId: 999,
        title: 'New order submitted',
        message: 'Order #999 is waiting for review.',
        metadata: { path: '/orders?status=PENDING' },
        requiresAttention: true,
      },
      {
        id: 302,
        type: 'ORDER_CREATED',
        category: 'ORDERS',
        createdAt: new Date('2026-04-12T00:00:00.000Z'),
        recipientUserId: 43,
        sourceEntityType: 'ORDER',
        sourceEntityId: 999,
        title: 'New order submitted',
        message: 'Order #999 is waiting for review.',
        metadata: { path: '/orders?status=PENDING' },
        requiresAttention: true,
      },
      {
        id: 303,
        type: 'ORDER_CREATED',
        category: 'ORDERS',
        createdAt: new Date('2026-04-12T00:00:00.000Z'),
        recipientUserId: 44,
        sourceEntityType: 'ORDER',
        sourceEntityId: 999,
        title: 'New order submitted',
        message: 'Order #999 is waiting for review.',
        metadata: { path: '/orders?status=PENDING' },
        requiresAttention: true,
      },
    ]);

    storeSettingsService.getNotificationEmailRouting.mockResolvedValue({
      adminEmail: 'admin@example.com',
      managementEmail: '',
      employeeEmail: '',
    });
    notificationService.getRecipientRolesForUsers.mockResolvedValue(new Map([
      [42, ['ADMIN']],
      [43, ['MANAGEMENT']],
      [44, ['EMPLOYEE']],
    ]));

    const { NotificationEventsService } = await import('./notificationEvents.service');
    const service = new NotificationEventsService();

    await service.emit({
      type: 'ORDER_CREATED',
      category: 'ORDERS',
      title: 'New order submitted',
      message: 'Order #999 is waiting for review.',
      recipientRoles: ['EMPLOYEE', 'MANAGEMENT', 'ADMIN'],
      sourceEntityType: 'ORDER',
      sourceEntityId: 999,
      channelIntent: 'ops_alert',
      sendToMake: true,
      metadata: { path: '/orders?status=PENDING', label: 'Review order' },
    });

    expect(notificationDeliveryService.deliver).toHaveBeenCalledWith([
      expect.objectContaining({
        notificationId: 301,
        notificationIds: [301, 302, 303],
        metadata: expect.objectContaining({
          recipientRole: 'ADMIN',
          destinationEmail: 'admin@example.com',
        }),
      }),
    ], 'ORDERS');

    expect(notificationService.updateDeliveryStatus).not.toHaveBeenCalled();
  });
});
