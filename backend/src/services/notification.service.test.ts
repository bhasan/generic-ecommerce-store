const prismaMock = {
  order: {
    groupBy: vi.fn(),
  },
  user: {
    count: vi.fn(),
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
});
