import { OrderStatus } from '../../generated/prisma';

const prismaMock = {
  user: {
    update: vi.fn(),
    findMany: vi.fn(),
  },
  productItem: {
    findMany: vi.fn(),
    update: vi.fn(),
  },
  order: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  orderItem: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
  $transaction: vi.fn(),
};

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

const creditService = {
  useCredit: vi.fn(),
  refundCredit: vi.fn(),
};

const notificationEventsService = {
  notifyOrderCreated: vi.fn(),
  notifyOrderStatusUpdated: vi.fn(),
};

const orderingConstraintsInstance = {
  getOrderingConstraints: vi.fn(),
};

const deliveryEligibilityService = {
  checkDeliveryEligibility: vi.fn(),
};

vi.mock('../config/database', () => ({
  default: prismaMock,
}));

vi.mock('../utils/logger', () => ({
  logger,
}));

vi.mock('./credit.service', () => ({
  default: creditService,
}));

vi.mock('./notificationEvents.service', () => ({
  notificationEventsService,
}));

vi.mock('./orderingConstraints.service', () => ({
  OrderingConstraintsService: vi.fn(() => orderingConstraintsInstance),
}));

vi.mock('./deliveryEligibility.service', () => ({
  DeliveryEligibilityService: vi.fn(() => deliveryEligibilityService),
}));

describe('order service notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (callback) => callback(prismaMock));
    orderingConstraintsInstance.getOrderingConstraints.mockResolvedValue({
      minimumDeliveryOrder: 0,
      minimumDeliveryOrderEnabled: false,
      deliveryRadiusMiles: 5,
      offlineZipFallbackEnabled: false,
      offlineDeliveryZipCodes: [],
    });
  });

  it('emits an order-created notification after successful checkout', async () => {
    prismaMock.productItem.findMany.mockResolvedValue([
      {
        id: 3,
        name: 'Product One',
        price: 10,
        stock: 10,
        stockEnabled: true,
        allowedQuantitiesOverride: [],
        quantityDiscountsOverride: null,
        category: { allowedQuantities: [], quantityDiscounts: null },
      },
    ]);
    prismaMock.order.create.mockResolvedValue({
      id: 77,
      userId: 5,
      total: 10.82,
      status: 'PENDING',
      paymentMethod: 'EXTERNAL',
      createdAt: new Date(),
      updatedAt: new Date(),
      deliveryMethod: 'PICKUP',
    });
    prismaMock.orderItem.create.mockResolvedValue({
      id: 901,
      orderId: 77,
      productId: 3,
      quantity: 1,
      price: 10,
    });
    prismaMock.productItem.update.mockResolvedValue({});

    const { OrderService } = await import('./order.service');
    const service = new OrderService();

    await service.createOrder({
      userId: 5,
      items: [{ productId: 3, quantity: 1 }],
      deliveryMethod: 'PICKUP',
      paymentMethod: 'EXTERNAL',
    });

    expect(notificationEventsService.notifyOrderCreated).toHaveBeenCalledWith(77, 5);
  });

  it('revalidates delivery eligibility during order creation and rejects out-of-zone orders', async () => {
    prismaMock.productItem.findMany.mockResolvedValue([
      {
        id: 3,
        name: 'Product One',
        price: 10,
        stock: 10,
        stockEnabled: true,
        allowedQuantitiesOverride: [],
        quantityDiscountsOverride: null,
        category: { allowedQuantities: [], quantityDiscounts: null },
      },
    ]);
    deliveryEligibilityService.checkDeliveryEligibility.mockResolvedValue({
      deliverable: false,
      deliveryZoneStatus: 'OUT_OF_ZONE',
      deliveryZoneSource: 'GOOGLE_GEOCODING',
      distanceMiles: 7.1,
      thresholdMiles: 5,
      message: 'Outside radius',
      canonicalAddress: '123 Main St, Houston, TX 77083',
      checkedAt: new Date('2026-04-04T02:00:00.000Z'),
    });

    const { OrderService } = await import('./order.service');
    const service = new OrderService();

    await expect(service.createOrder({
      userId: 5,
      items: [{ productId: 3, quantity: 1 }],
      deliveryMethod: 'DELIVERY',
      deliveryAddress: {
        street: '123 Main St',
        city: 'Houston',
        state: 'TX',
        zipCode: '77083',
      },
      paymentMethod: 'EXTERNAL',
    })).rejects.toThrow('Outside radius');

    expect(deliveryEligibilityService.checkDeliveryEligibility).toHaveBeenCalledWith({
      street: '123 Main St',
      city: 'Houston',
      state: 'TX',
      zipCode: '77083',
    });
    expect(prismaMock.order.create).not.toHaveBeenCalled();
  });

  it('emits an order-status notification after successful status update', async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      id: 77,
      userId: 5,
      status: OrderStatus.APPROVED,
      total: 10,
      paymentMethod: 'EXTERNAL',
    });
    prismaMock.order.update.mockResolvedValue({
      id: 77,
      userId: 5,
      status: OrderStatus.READY_FOR_DELIVERY,
      updatedAt: new Date('2024-01-02'),
    });
    prismaMock.orderItem.findMany.mockResolvedValue([
      { id: 1, orderId: 77, productId: 3, quantity: 1, price: 10, voided: false },
    ]);
    prismaMock.productItem.findMany.mockResolvedValue([
      { id: 3, name: 'Product One' },
    ]);

    const { OrderService } = await import('./order.service');
    const service = new OrderService();

    await service.updateOrderStatus(77, { status: OrderStatus.READY_FOR_DELIVERY }, ['MANAGEMENT']);

    expect(notificationEventsService.notifyOrderStatusUpdated).toHaveBeenCalledWith(
      77,
      5,
      OrderStatus.READY_FOR_DELIVERY,
      OrderStatus.APPROVED,
    );
  });
});
