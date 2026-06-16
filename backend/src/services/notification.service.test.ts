import { describe, it, expect, beforeEach, vi } from 'vitest';
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

vi.mock('./notificationEvents.service', () => ({
  notificationEventsService: {
    notifyAccountApproved: vi.fn(),
    notifyAccountRejected: vi.fn(),
  },
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

  it('does not expand direct-recipient auth notifications to management roles by category', async () => {
    prismaMock.role.findMany.mockResolvedValue([]);
    prismaMock.userRole.findMany.mockResolvedValue([]);
    prismaMock.user.findMany.mockResolvedValue([]);
    prismaMock.notification.create.mockResolvedValue({ id: 3, recipientUserId: 31 });

    const { NotificationService } = await import('./notification.service');
    const service = new NotificationService();

    const result = await service.createNotifications({
      type: 'ACCOUNT_APPROVED',
      category: 'AUTH',
      title: 'Account approved',
      message: 'Your account has been approved.',
      recipientUserIds: [31],
    });

    expect(prismaMock.role.findMany).not.toHaveBeenCalled();
    expect(prismaMock.notification.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.notification.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        recipientUserId: 31,
        category: 'AUTH',
      }),
    }));
    expect(result).toHaveLength(1);
  });

  it('getStaffNotificationCounts returns same pending count as userService.getPendingRegistrationCount', async () => {
    prismaMock.order.groupBy.mockResolvedValue([]);
    prismaMock.user.count.mockResolvedValue(7);

    const { NotificationService } = await import('./notification.service');
    const { UserService } = await import('./user.service');
    const notifService = new NotificationService();
    const userSvc = new UserService();

    const [notifResult, userCount] = await Promise.all([
      notifService.getStaffNotificationCounts(),
      userSvc.getPendingRegistrationCount(),
    ]);

    expect(notifResult.pendingRegistrations).toBe(7);
    expect(userCount).toBe(7);
    expect(notifResult.pendingRegistrations).toBe(userCount);
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
