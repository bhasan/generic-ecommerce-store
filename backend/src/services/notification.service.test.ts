const prismaMock = {
  order: {
    groupBy: vi.fn(),
  },
  user: {
    count: vi.fn(),
    findMany: vi.fn(),
  },
  notification: {
    findMany: vi.fn(),
    count: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
  },
  role: {
    findMany: vi.fn(),
  },
  userRole: {
    findMany: vi.fn(),
  },
};

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

vi.mock('../config/database', () => ({
  default: prismaMock,
}));

vi.mock('../utils/logger', () => ({
  logger,
}));

describe('notification service logging', () => {
  beforeEach(() => vi.clearAllMocks());

  it('logs computed notification counts', async () => {
    prismaMock.order.groupBy.mockResolvedValue([
      { status: 'PENDING', _count: { status: 2 } },
      { status: 'READY_FOR_DELIVERY', _count: { status: 1 } },
    ]);
    prismaMock.user.count.mockResolvedValue(4);
    const { NotificationService } = await import('./notification.service');
    const service = new NotificationService();

    const result = await service.getStaffNotificationCounts();

    expect(logger.info).toHaveBeenCalledWith('Staff notification counts computed', expect.objectContaining({
      pendingRegistrations: 4,
    }));
    expect(result.ordersByStatus.PENDING).toBe(2);
    expect(result.pendingRegistrations).toBe(4);
  });

  it('creates notifications for resolved direct and role recipients', async () => {
    prismaMock.role.findMany.mockResolvedValue([{ id: 2, name: 'MANAGEMENT' }]);
    prismaMock.userRole.findMany.mockResolvedValue([{ userId: 12, roleId: 2 }]);
    prismaMock.user.findMany.mockResolvedValue([{ id: 12 }]);
    prismaMock.notification.create
      .mockResolvedValueOnce({ id: 1, recipientUserId: 9 })
      .mockResolvedValueOnce({ id: 2, recipientUserId: 12 });

    const { NotificationService } = await import('./notification.service');
    const service = new NotificationService();

    const result = await service.createNotifications({
      type: 'ORDER_CREATED',
      category: 'ORDERS',
      title: 'New order submitted',
      message: 'Order #41 is waiting for review.',
      recipientUserIds: [9],
      recipientRoles: ['MANAGEMENT'],
      sourceEntityType: 'ORDER',
      sourceEntityId: 41,
      requiresAttention: true,
    });

    expect(prismaMock.notification.create).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(2);
    expect(logger.info).toHaveBeenCalledWith('Notifications created', expect.objectContaining({
      recipientCount: 2,
      requiresAttention: true,
    }));
  });

  it('lists unread notifications for a user', async () => {
    prismaMock.notification.findMany.mockResolvedValue([{ id: 3 }]);

    const { NotificationService } = await import('./notification.service');
    const service = new NotificationService();

    const result = await service.listForUser(7, { unreadOnly: true, limit: 10 });

    expect(prismaMock.notification.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        recipientUserId: 7,
        readAt: null,
      },
      take: 10,
    }));
    expect(result).toEqual([{ id: 3 }]);
  });
});
