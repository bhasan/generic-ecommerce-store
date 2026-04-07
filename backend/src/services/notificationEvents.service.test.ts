const notificationService = {
  createNotifications: vi.fn(),
};

const notificationDeliveryService = {
  deliver: vi.fn(),
};

vi.mock('./notification.service', () => ({
  notificationService,
}));

vi.mock('./notificationDelivery.service', () => ({
  notificationDeliveryService,
}));

describe('notification events service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it('marks rejection and support-reply notifications as urgent while only sending replies to make', async () => {
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
      channelIntent: 'email',
      sendToMake: true,
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
});
