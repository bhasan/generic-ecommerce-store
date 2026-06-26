import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OrderStatus, Prisma } from '../../generated/prisma';
const D = (n: number) => new Prisma.Decimal(n);
import { DeliveryMethod, PaymentMethod } from '../constants/orderMethods';

// Variant fixture in the post-Phase-2 shape (price/stock as Decimal on the variant).
const makeVariant = (overrides: Record<string, unknown> = {}) => ({
  id: 3,
  label: 'Default',
  sku: 'sku-3',
  pricingMode: 'UNIT',
  basePrice: D(10),
  stock: D(10),
  stockEnabled: true,
  active: true,
  product: { id: 3, name: 'Product One' },
  quantityOptions: [],
  priceBreaks: [],
  ...overrides,
});

const prismaMock = {
  user: {
    update: vi.fn(),
    findMany: vi.fn(),
  },
  productVariant: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  order: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  orderItem: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  orderStatusEvent: {
    create: vi.fn(),
  },
  payment: {
    create: vi.fn(),
    updateMany: vi.fn(),
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

const thermalPrinterService = {
  dispatchReceipt: vi.fn(),
};

const orderingConstraintsInstance = {
  getOrderingConstraints: vi.fn(),
};

const deliveryEligibilityService = {
  checkDeliveryEligibility: vi.fn(),
};

const posOrderService = vi.hoisted(() => ({ enqueue: vi.fn().mockResolvedValue(undefined), pushOrderCreated: vi.fn(), pushOrderUpdated: vi.fn() }));
const posRegistry = vi.hoisted(() => ({ getOrderSync: vi.fn() }));

vi.mock('../config/database', () => ({
  default: prismaMock,
}));

vi.mock('../utils/logger', () => ({
  logger,
}));

vi.mock('./store-credit.service', () => ({
  default: creditService,
}));

vi.mock('./notificationEvents.service', () => ({
  notificationEventsService,
}));

vi.mock('./thermalPrinter.service', () => ({
  thermalPrinterService,
}));

vi.mock('./orderingConstraints.service', () => ({
  OrderingConstraintsService: vi.fn(() => orderingConstraintsInstance),
}));

vi.mock('./deliveryEligibility.service', () => ({
  DeliveryEligibilityService: vi.fn(() => deliveryEligibilityService),
}));

vi.mock('./pos/orders/posOrderService', () => posOrderService);
vi.mock('./pos/registry', () => posRegistry);
vi.mock('./storeSettings.service', () => ({
  StoreSettingsService: vi.fn(() => ({ getStoreSettings: vi.fn().mockResolvedValue({ posProvider: 'foreverpos', posConfig: {} }) })),
}));

describe('getAllOrders', () => {
  beforeEach(() => vi.clearAllMocks());

  const setupOrderMocks = () => {
    prismaMock.order.findMany.mockResolvedValue([]);
    prismaMock.user.findMany.mockResolvedValue([]);
    prismaMock.orderItem.findMany.mockResolvedValue([]);
    prismaMock.productVariant.findMany.mockResolvedValue([]);
  };

  it('scopes query to the requesting user when role is CUSTOMER', async () => {
    setupOrderMocks();
    const { OrderService } = await import('./order.service');
    const service = new OrderService();

    await service.getAllOrders(42, ['CUSTOMER']);

    expect(prismaMock.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 42 } })
    );
  });

  it('returns all orders (no userId filter) for ADMIN role', async () => {
    setupOrderMocks();
    const { OrderService } = await import('./order.service');
    const service = new OrderService();

    await service.getAllOrders(1, ['ADMIN']);

    expect(prismaMock.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} })
    );
  });

  it('passes limit and offset to Prisma when provided', async () => {
    setupOrderMocks();
    const { OrderService } = await import('./order.service');
    const service = new OrderService();

    await service.getAllOrders(1, ['ADMIN'], 50, 100);

    expect(prismaMock.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50, skip: 100 })
    );
  });

  it('omits take/skip from Prisma query when limit and offset are not provided', async () => {
    setupOrderMocks();
    const { OrderService } = await import('./order.service');
    const service = new OrderService();

    await service.getAllOrders(1, ['ADMIN']);

    const call = prismaMock.order.findMany.mock.calls[0][0];
    expect(call).not.toHaveProperty('take');
    expect(call).not.toHaveProperty('skip');
  });

  it('getOrders requests a lean items shape without the variant→product→images join', async () => {
    prismaMock.order.findMany.mockResolvedValue([]);
    const { OrderService } = await import('./order.service');
    const service = new OrderService();
    await service.getAllOrders(1, ['ADMIN']);
    const arg = prismaMock.order.findMany.mock.calls[0][0];
    // items must use a scalar `select`, not a nested variant include
    expect(arg.include.items.select).toBeDefined();
    // No nested variant relation — select keys must all be scalar booleans
    expect(arg.include.items.select.variant).toBeUndefined();
    expect(arg.include.items.include).toBeUndefined();
  });
});

describe('order service notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    posOrderService.enqueue.mockClear();
    posRegistry.getOrderSync.mockReturnValue({ shouldPushStatus: () => true, pushOrder: vi.fn(), pushStatus: vi.fn() });
    // Default: handle both array form (used by updateOrderStatus) and callback form (used by createOrder/addItemToOrder).
    prismaMock.$transaction.mockImplementation(async (opsOrCallback: unknown) => {
      if (typeof opsOrCallback === 'function') return opsOrCallback(prismaMock);
      if (Array.isArray(opsOrCallback)) return Promise.all(opsOrCallback);
      return opsOrCallback;
    });
    orderingConstraintsInstance.getOrderingConstraints.mockResolvedValue({
      minimumDeliveryOrder: 0,
      minimumDeliveryOrderEnabled: false,
      deliveryRadiusMiles: 5,
      offlineZipFallbackEnabled: false,
      offlineDeliveryZipCodes: [],
    });
  });

  it('emits an order-created notification after successful checkout', async () => {
    prismaMock.productVariant.findMany.mockResolvedValue([makeVariant()]);
    prismaMock.order.create.mockResolvedValue({
      id: 77,
      userId: 5,
      total: D(10.82),
      status: 'PENDING',
      paymentMethod: PaymentMethod.EXTERNAL,
      createdAt: new Date(),
      updatedAt: new Date(),
      deliveryMethod: DeliveryMethod.PICKUP,
    });
    prismaMock.orderItem.create.mockResolvedValue({
      id: 901,
      orderId: 77,
      productId: 3,
      quantity: 1,
      price: 10,
    });
    prismaMock.productVariant.update.mockResolvedValue({});
    prismaMock.productVariant.updateMany.mockResolvedValue({ count: 1 });

    const { OrderService } = await import('./order.service');
    const service = new OrderService();

    await service.createOrder({
      userId: 5,
      items: [{ variantId: 3, quantity: 1 }],
      deliveryMethod: DeliveryMethod.PICKUP,
      paymentMethod: PaymentMethod.EXTERNAL,
    });

    expect(notificationEventsService.notifyOrderCreated).toHaveBeenCalledWith(77, 5);
    expect(thermalPrinterService.dispatchReceipt).toHaveBeenCalledWith(77, 'ORDER_CREATED', {
      userId: 5,
    });
    expect(posOrderService.enqueue).not.toHaveBeenCalled();
  });

  it('revalidates delivery eligibility during order creation and rejects out-of-zone orders', async () => {
    prismaMock.productVariant.findMany.mockResolvedValue([makeVariant()]);
    deliveryEligibilityService.checkDeliveryEligibility.mockResolvedValue({
      deliverable: false,
      deliveryStatus: 'OUT_OF_ZONE',
      deliverySource: 'GOOGLE_GEOCODING',
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
      items: [{ variantId: 3, quantity: 1 }],
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
      total: D(10),
      paymentMethod: PaymentMethod.EXTERNAL,
    });
    prismaMock.order.update.mockResolvedValue({
      id: 77,
      userId: 5,
      status: OrderStatus.READY_FOR_DELIVERY,
      updatedAt: new Date('2024-01-02'),
    });
    prismaMock.orderStatusEvent.create.mockResolvedValue({ id: 1 });
    prismaMock.orderItem.findMany.mockResolvedValue([
      { id: 1, orderId: 77, productId: 3, quantity: 1, price: 10, voided: false },
    ]);
    prismaMock.productVariant.findMany.mockResolvedValue([
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
    expect(posOrderService.enqueue).toHaveBeenCalledWith(expect.anything(), expect.any(Number), 'ORDER_UPDATED');
  });

  it('creates an OrderStatusEvent row with correct fromStatus, toStatus, changedBy, and note on status update', async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      id: 77,
      userId: 5,
      status: OrderStatus.PENDING,
      total: D(10),
      paymentMethod: PaymentMethod.EXTERNAL,
    });
    const updatedOrderResult = {
      id: 77,
      userId: 5,
      status: OrderStatus.APPROVED,
      updatedAt: new Date('2024-01-02'),
    };
    prismaMock.order.update.mockResolvedValue(updatedOrderResult);
    prismaMock.orderStatusEvent.create.mockResolvedValue({ id: 1 });
    prismaMock.payment.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.orderItem.findMany.mockResolvedValue([]);
    prismaMock.productVariant.findMany.mockResolvedValue([]);

    const { OrderService } = await import('./order.service');
    const service = new OrderService();

    await service.updateOrderStatus(77, {
      status: OrderStatus.APPROVED,
      changedBy: 42,
      note: 'Approved by manager',
    }, ['MANAGEMENT']);

    expect(prismaMock.$transaction).toHaveBeenCalled();
    expect(posOrderService.enqueue).toHaveBeenCalledWith(expect.anything(), 77, 'ORDER_CREATED');
    expect(prismaMock.orderStatusEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fromStatus: OrderStatus.PENDING,
          toStatus: OrderStatus.APPROVED,
          changedBy: 42,
          note: 'Approved by manager',
        }),
      }),
    );
  });

  it('queues a manual reprint for an existing order', async () => {
    prismaMock.order.findUnique.mockResolvedValue({ id: 77 });
    thermalPrinterService.dispatchReceipt.mockResolvedValue({
      queued: true,
      reason: 'MANUAL_REPRINT',
      orderId: 77,
    });

    const { OrderService } = await import('./order.service');
    const service = new OrderService();

    const result = await service.printOrderReceipt(77, {
      actor: {
        userId: 2,
        username: 'employee-one',
      },
    });

    expect(result).toEqual({
      queued: true,
      reason: 'MANUAL_REPRINT',
      orderId: 77,
    });
    expect(thermalPrinterService.dispatchReceipt).toHaveBeenCalledWith(77, 'MANUAL_REPRINT', {
      userId: 2,
      username: 'employee-one',
    });
  });

  it('does not fail checkout when printer dispatch throws unexpectedly', async () => {
    prismaMock.productVariant.findMany.mockResolvedValue([makeVariant()]);
    prismaMock.order.create.mockResolvedValue({
      id: 78,
      userId: 5,
      total: D(10.82),
      status: 'PENDING',
      paymentMethod: 'EXTERNAL',
      createdAt: new Date(),
      updatedAt: new Date(),
      deliveryMethod: 'PICKUP',
    });
    prismaMock.orderItem.create.mockResolvedValue({
      id: 902,
      orderId: 78,
      productId: 3,
      quantity: 1,
      price: 10,
    });
    prismaMock.productVariant.update.mockResolvedValue({});
    prismaMock.productVariant.updateMany.mockResolvedValue({ count: 1 });
    thermalPrinterService.dispatchReceipt.mockRejectedValue(new Error('Printer exploded'));

    const { OrderService } = await import('./order.service');
    const service = new OrderService();

    await expect(service.createOrder({
      userId: 5,
      items: [{ variantId: 3, quantity: 1 }],
      deliveryMethod: 'PICKUP',
      paymentMethod: 'EXTERNAL',
    })).resolves.toMatchObject({
      id: 78,
      status: 'PENDING',
    });
  });

  it('does not push to POS on createOrder when payment method is CC (notifiesOnCreate=false)', async () => {
    prismaMock.productVariant.findMany.mockResolvedValue([makeVariant()]);
    prismaMock.order.create.mockResolvedValue({
      id: 80,
      userId: 5,
      total: D(10.82),
      status: 'PENDING',
      paymentMethod: PaymentMethod.CC,
      createdAt: new Date(),
      updatedAt: new Date(),
      deliveryMethod: DeliveryMethod.PICKUP,
    });
    prismaMock.orderItem.create.mockResolvedValue({
      id: 903,
      orderId: 80,
      productId: 3,
      quantity: 1,
      price: 10,
    });
    prismaMock.productVariant.update.mockResolvedValue({});
    prismaMock.productVariant.updateMany.mockResolvedValue({ count: 1 });

    const { OrderService } = await import('./order.service');
    const service = new OrderService();

    await service.createOrder({
      userId: 5,
      items: [{ variantId: 3, quantity: 1 }],
      deliveryMethod: DeliveryMethod.PICKUP,
      paymentMethod: PaymentMethod.CC,
    });

    expect(posOrderService.enqueue).not.toHaveBeenCalled();
  });

  it('returns 404 when trying to reprint a nonexistent order', async () => {
    prismaMock.order.findUnique.mockResolvedValue(null);

    const { OrderService } = await import('./order.service');
    const service = new OrderService();

    await expect(service.printOrderReceipt(999)).rejects.toMatchObject({
      message: 'Order not found',
      statusCode: 404,
    });
  });

  describe('customerArrive', () => {
    it('successfully updates order status to ARRIVED and appends parking spot', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        id: 101,
        userId: 5,
        status: OrderStatus.READY_FOR_PICKUP,
        deliveryMethod: 'CURBSIDE',
        deliveryAddress: 'CURBSIDE: Silver Camry',
      });
      prismaMock.order.update.mockResolvedValue({
        id: 101,
        userId: 5,
        status: OrderStatus.ARRIVED,
        deliveryAddress: 'CURBSIDE: Silver Camry | SPOT: Space 4',
        updatedAt: new Date(),
      });
      prismaMock.orderItem.findMany.mockResolvedValue([]);

      const { OrderService } = await import('./order.service');
      const service = new OrderService();

      const result = await service.customerArrive(101, 5, 'Space 4');

      expect(result).toMatchObject({
        id: 101,
        status: OrderStatus.ARRIVED,
        deliveryAddress: 'CURBSIDE: Silver Camry | SPOT: Space 4',
      });
      expect(prismaMock.order.update).toHaveBeenCalledWith({
        where: { id: 101 },
        data: {
          status: OrderStatus.ARRIVED,
          deliveryAddress: 'CURBSIDE: Silver Camry | SPOT: Space 4',
          parkingSpot: 'Space 4',
        },
      });
      expect(notificationEventsService.notifyOrderStatusUpdated).toHaveBeenCalledWith(
        101,
        5,
        OrderStatus.ARRIVED,
        OrderStatus.READY_FOR_PICKUP,
      );
    });

    it('rejects with 404 if order does not exist', async () => {
      prismaMock.order.findUnique.mockResolvedValue(null);

      const { OrderService } = await import('./order.service');
      const service = new OrderService();

      await expect(service.customerArrive(999, 5, 'Space 4')).rejects.toMatchObject({
        message: 'Order not found',
        statusCode: 404,
      });
    });

    it('rejects with 403 if order does not belong to user', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        id: 101,
        userId: 10,
        status: OrderStatus.READY_FOR_PICKUP,
        deliveryMethod: 'CURBSIDE',
      });

      const { OrderService } = await import('./order.service');
      const service = new OrderService();

      await expect(service.customerArrive(101, 5, 'Space 4')).rejects.toMatchObject({
        message: 'Access denied',
        statusCode: 403,
      });
    });

    it('rejects with 400 if order is not a curbside pickup', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        id: 101,
        userId: 5,
        status: OrderStatus.READY_FOR_PICKUP,
        deliveryMethod: 'PICKUP',
      });

      const { OrderService } = await import('./order.service');
      const service = new OrderService();

      await expect(service.customerArrive(101, 5, 'Space 4')).rejects.toMatchObject({
        message: 'Arrival notification is only available for curbside orders',
        statusCode: 400,
      });
    });

    it('rejects with 400 if order is not in READY_FOR_PICKUP status', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        id: 101,
        userId: 5,
        status: OrderStatus.PENDING,
        deliveryMethod: 'CURBSIDE',
      });

      const { OrderService } = await import('./order.service');
      const service = new OrderService();

      await expect(service.customerArrive(101, 5, 'Space 4')).rejects.toMatchObject({
        message: 'Order must be in READY_FOR_PICKUP status to check in',
        statusCode: 400,
      });
    });
  });

  describe('addItemToOrder', () => {
    beforeEach(() => vi.clearAllMocks());

    it('decrements stock for stock-enabled product when adding item to order', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        id: 10,
        total: D(20.00),
      });

      prismaMock.productVariant.findUnique.mockResolvedValue(
        makeVariant({ id: 5, product: { id: 5, name: 'Test Product' }, stock: D(5) })
      );

      const txMock = {
        orderItem: { create: vi.fn().mockResolvedValue({
          id: 99,
          orderId: 10,
          variantId: 5,
          quantity: 2,
          unitPrice: D(10),
          addedAfterSubmission: true,
        }) },
        order: { update: vi.fn().mockResolvedValue({ id: 10, total: 40.00 }) },
        productVariant: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      };
      prismaMock.$transaction.mockImplementation(async (callback) => callback(txMock));

      const { OrderService } = await import('./order.service');
      const service = new OrderService();

      const result = await service.addItemToOrder(10, { variantId: 5, quantity: 2 });

      expect(result.id).toBe(99);
      expect(txMock.productVariant.updateMany).toHaveBeenCalledWith({
        where: { id: 5, stock: { gte: 2 } },
        data: { stock: { decrement: 2 } },
      });
    });

    it('throws 400 with insufficient stock message when stock is too low (via updateMany race)', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        id: 10,
        total: D(20.00),
      });

      prismaMock.productVariant.findUnique.mockResolvedValue(
        makeVariant({ id: 5, product: { id: 5, name: 'Low Stock Product' }, stock: D(1) })
      );

      const txMock = {
        orderItem: { create: vi.fn() },
        order: { update: vi.fn() },
        productVariant: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      };
      prismaMock.$transaction.mockImplementation(async (callback) => callback(txMock));

      const { OrderService } = await import('./order.service');
      const service = new OrderService();

      await expect(service.addItemToOrder(10, { variantId: 5, quantity: 3 })).rejects.toMatchObject({
        message: 'Insufficient stock for Low Stock Product',
        statusCode: 400,
      });
    });

    it('does not decrement stock for non-stock-enabled product', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        id: 10,
        total: D(20.00),
      });

      prismaMock.productVariant.findUnique.mockResolvedValue(
        makeVariant({ id: 7, product: { id: 7, name: 'No Stock Product' }, basePrice: D(5), stock: D(0), stockEnabled: false })
      );

      const txMock = {
        orderItem: { create: vi.fn().mockResolvedValue({
          id: 100,
          orderId: 10,
          variantId: 7,
          quantity: 2,
          unitPrice: D(5),
          addedAfterSubmission: true,
        }) },
        order: { update: vi.fn().mockResolvedValue({ id: 10, total: 30.00 }) },
        productVariant: { updateMany: vi.fn() },
      };
      prismaMock.$transaction.mockImplementation(async (callback) => callback(txMock));

      const { OrderService } = await import('./order.service');
      const service = new OrderService();

      const result = await service.addItemToOrder(10, { variantId: 7, quantity: 2 });

      expect(result.id).toBe(100);
      expect(txMock.productVariant.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('updateOrderStatus — delivery driver permissions', () => {
    const driver = ['DELIVERY_DRIVER'];

    const seedDeliverableOrder = (status: OrderStatus) => {
      prismaMock.order.findUnique.mockResolvedValue({
        id: 50, userId: 5, status, total: D(10), paymentMethod: PaymentMethod.EXTERNAL,
      });
      prismaMock.order.update.mockResolvedValue({
        id: 50, userId: 5, status: OrderStatus.DELIVERED, updatedAt: new Date(),
      });
      prismaMock.orderStatusEvent.create.mockResolvedValue({ id: 1 });
      prismaMock.orderItem.findMany.mockResolvedValue([]);
      prismaMock.productVariant.findMany.mockResolvedValue([]);
    };

    it('lets a driver mark an OUT_FOR_DELIVERY order as DELIVERED (the staff-dispatch handoff)', async () => {
      seedDeliverableOrder(OrderStatus.OUT_FOR_DELIVERY);
      const { OrderService } = await import('./order.service');
      const service = new OrderService();

      await service.updateOrderStatus(50, { status: OrderStatus.DELIVERED }, driver);

      expect(prismaMock.order.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 50 }, data: { status: OrderStatus.DELIVERED } }),
      );
    });

    it('still lets a driver deliver a READY_FOR_DELIVERY order', async () => {
      seedDeliverableOrder(OrderStatus.READY_FOR_DELIVERY);
      const { OrderService } = await import('./order.service');
      const service = new OrderService();

      await service.updateOrderStatus(50, { status: OrderStatus.DELIVERED }, driver);

      expect(prismaMock.order.update).toHaveBeenCalled();
    });

    it('rejects delivering an order that is not in a deliverable state', async () => {
      seedDeliverableOrder(OrderStatus.PENDING);
      const { OrderService } = await import('./order.service');
      const service = new OrderService();

      await expect(
        service.updateOrderStatus(50, { status: OrderStatus.DELIVERED }, driver),
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(prismaMock.order.update).not.toHaveBeenCalled();
    });

    it('rejects a driver setting any status other than DELIVERED', async () => {
      seedDeliverableOrder(OrderStatus.OUT_FOR_DELIVERY);
      const { OrderService } = await import('./order.service');
      const service = new OrderService();

      await expect(
        service.updateOrderStatus(50, { status: OrderStatus.OUT_FOR_DELIVERY }, driver),
      ).rejects.toMatchObject({ statusCode: 403 });
      expect(prismaMock.order.update).not.toHaveBeenCalled();
    });
  });
});

describe('getOrderById', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns an order response that includes shaped statusEvents[] and payments[] arrays', async () => {
    const now = new Date('2024-06-01T12:00:00Z');
    prismaMock.order.findUnique.mockResolvedValue({
      id: 99,
      userId: 7,
      status: OrderStatus.APPROVED,
      total: D(25),
      paymentMethod: PaymentMethod.CARD,
      deliveryMethod: 'DELIVERY',
      deliveryAddress: null,
      cashAppUsername: null,
      vehicleDescription: null,
      note: null,
      createdAt: now,
      updatedAt: now,
      user: { id: 7, username: 'alice', phoneNumber: null, address: null },
      items: [],
      statusEvents: [
        {
          id: 1,
          orderId: 99,
          fromStatus: null,
          toStatus: OrderStatus.PENDING,
          changedBy: null,
          note: 'Order placed',
          createdAt: now,
        },
        {
          id: 2,
          orderId: 99,
          fromStatus: OrderStatus.PENDING,
          toStatus: OrderStatus.APPROVED,
          changedBy: 3,
          note: null,
          createdAt: now,
        },
      ],
      payments: [
        {
          id: 10,
          orderId: 99,
          method: PaymentMethod.CARD,
          status: 'APPROVED',
          amount: D(25),
          transactionId: 'txn_xyz',
          createdAt: now,
        },
      ],
    });

    const { OrderService } = await import('./order.service');
    const service = new OrderService();

    const result = await service.getOrderById(99, 7, ['CUSTOMER']);

    expect(result.statusEvents).toHaveLength(2);
    expect(result.statusEvents[0]).toMatchObject({
      id: 1,
      fromStatus: null,
      toStatus: OrderStatus.PENDING,
      changedBy: null,
      note: 'Order placed',
      createdAt: now.toISOString(),
    });
    expect(result.statusEvents[1]).toMatchObject({
      fromStatus: OrderStatus.PENDING,
      toStatus: OrderStatus.APPROVED,
      changedBy: 3,
    });

    expect(result.payments).toHaveLength(1);
    expect(result.payments[0]).toMatchObject({
      id: 10,
      method: PaymentMethod.CARD,
      status: 'APPROVED',
      amount: 25,
      transactionId: 'txn_xyz',
      createdAt: now.toISOString(),
    });
  });

  it('throws 404 when order does not exist', async () => {
    prismaMock.order.findUnique.mockResolvedValue(null);
    const { OrderService } = await import('./order.service');
    const service = new OrderService();
    await expect(service.getOrderById(999, 1, ['ADMIN'])).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 403 when a customer tries to view another user\'s order', async () => {
    const now = new Date();
    prismaMock.order.findUnique.mockResolvedValue({
      id: 100,
      userId: 42,
      status: OrderStatus.PENDING,
      total: D(10),
      paymentMethod: PaymentMethod.EXTERNAL,
      deliveryMethod: 'DELIVERY',
      deliveryAddress: null,
      cashAppUsername: null,
      vehicleDescription: null,
      note: null,
      createdAt: now,
      updatedAt: now,
      user: { id: 42, username: 'bob', phoneNumber: null, address: null },
      items: [],
      statusEvents: [],
      payments: [],
    });
    const { OrderService } = await import('./order.service');
    const service = new OrderService();
    // userId 99 != order.userId 42, role is CUSTOMER only
    await expect(service.getOrderById(100, 99, ['CUSTOMER'])).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe('updateOrderStatus — EXTERNAL payment settlement', () => {
  const makeOrder = (paymentMethod: string, status: string) => ({
    id: 77,
    userId: 5,
    status,
    total: D(10),
    paymentMethod,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    const updated = { id: 77, userId: 5, status: OrderStatus.APPROVED, updatedAt: new Date() };
    prismaMock.order.update.mockResolvedValue(updated);
    prismaMock.orderStatusEvent.create.mockResolvedValue({ id: 1 });
    prismaMock.payment.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.$transaction.mockImplementation(async (opsOrCallback: unknown) => {
      if (typeof opsOrCallback === 'function') return opsOrCallback(prismaMock);
      if (Array.isArray(opsOrCallback)) return Promise.all(opsOrCallback);
      return opsOrCallback;
    });
    prismaMock.orderItem.findMany.mockResolvedValue([]);
    posRegistry.getOrderSync.mockReturnValue({ shouldPushStatus: () => true, pushOrder: vi.fn(), pushStatus: vi.fn() });
  });

  it('settles PENDING payments when EXTERNAL order is APPROVED', async () => {
    prismaMock.order.findUnique.mockResolvedValue(makeOrder(PaymentMethod.EXTERNAL, OrderStatus.PENDING));

    const { OrderService } = await import('./order.service');
    const service = new OrderService();
    await service.updateOrderStatus(77, { status: OrderStatus.APPROVED }, ['MANAGEMENT']);

    expect(prismaMock.payment.updateMany).toHaveBeenCalledWith({
      where: { orderId: 77, status: 'PENDING' },
      data: { status: 'SETTLED' },
    });
  });

  it('does NOT call payment.updateMany for non-EXTERNAL orders on APPROVED', async () => {
    prismaMock.order.findUnique.mockResolvedValue(makeOrder(PaymentMethod.STORE_CREDIT, OrderStatus.PENDING));

    const { OrderService } = await import('./order.service');
    const service = new OrderService();
    await service.updateOrderStatus(77, { status: OrderStatus.APPROVED }, ['MANAGEMENT']);

    expect(prismaMock.payment.updateMany).not.toHaveBeenCalled();
  });

  it('does NOT call payment.updateMany for EXTERNAL orders on non-APPROVED status', async () => {
    prismaMock.order.findUnique.mockResolvedValue(makeOrder(PaymentMethod.EXTERNAL, OrderStatus.PENDING));
    prismaMock.$transaction.mockImplementation(async () => {
      const updated = { id: 77, userId: 5, status: OrderStatus.READY_FOR_DELIVERY, updatedAt: new Date() };
      return [updated, { id: 1 }];
    });

    const { OrderService } = await import('./order.service');
    const service = new OrderService();
    await service.updateOrderStatus(77, { status: OrderStatus.READY_FOR_DELIVERY }, ['MANAGEMENT']);

    expect(prismaMock.payment.updateMany).not.toHaveBeenCalled();
  });
});

describe('stock race protection', () => {
  it('throws insufficient stock when updateMany matches 0 rows (race condition)', async () => {
    const variant = makeVariant({ stock: D(1), stockEnabled: true });
    prismaMock.productVariant.findMany.mockResolvedValue([variant]);

    // Simulate the race: another request already took the last unit,
    // so updateMany finds no rows matching stock >= quantity.
    const txMock = {
      order: { create: vi.fn().mockResolvedValue({ id: 99, status: 'PENDING', total: D(10), subtotal: D(10), tax: D(0), taxRate: D(0.1), deliveryMethod: 'PICKUP', paymentMethod: 'CASH', createdAt: new Date() }) },
      orderItem: { create: vi.fn().mockResolvedValue({}) },
      productVariant: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      payment: { create: vi.fn().mockResolvedValue({}) },
    };
    prismaMock.$transaction.mockImplementation((fn: (tx: any) => any) => fn(txMock));

    const { OrderService } = await import('./order.service');
    const service = new OrderService();
    await expect(
      service.createOrder({
        userId: 1,
        items: [{ variantId: 3, quantity: 1 }],
        deliveryMethod: DeliveryMethod.PICKUP,
        paymentMethod: PaymentMethod.CASH,
        cashAppUsername: null,
        deliveryAddress: null,
        vehicleDescription: null,
      })
    ).rejects.toThrow('Insufficient stock');
  });

  it('succeeds when updateMany matches the row (stock available)', async () => {
    const variant = makeVariant({ stock: D(5), stockEnabled: true });
    prismaMock.productVariant.findMany.mockResolvedValue([variant]);

    const txMock = {
      order: { create: vi.fn().mockResolvedValue({ id: 100, status: 'PENDING', total: D(10), subtotal: D(10), tax: D(0), taxRate: D(0.1), deliveryMethod: 'PICKUP', paymentMethod: 'CASH', createdAt: new Date() }) },
      orderItem: { create: vi.fn().mockResolvedValue({}) },
      productVariant: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      payment: { create: vi.fn().mockResolvedValue({}) },
    };
    prismaMock.$transaction.mockImplementation((fn: (tx: any) => any) => fn(txMock));

    const { OrderService } = await import('./order.service');
    const service = new OrderService();
    // Should not throw
    await expect(
      service.createOrder({
        userId: 1,
        items: [{ variantId: 3, quantity: 1 }],
        deliveryMethod: DeliveryMethod.PICKUP,
        paymentMethod: PaymentMethod.CASH,
        cashAppUsername: null,
        deliveryAddress: null,
        vehicleDescription: null,
      })
    ).resolves.toBeDefined();
  });

  it('addItem throws insufficient stock when updateMany matches 0 rows', async () => {
    const order = {
      id: 1, userId: 1, status: 'PENDING', total: D(10),
      deliveryMethod: 'PICKUP', paymentMethod: 'CASH',
    };
    const variant = makeVariant({ stock: D(0), stockEnabled: true });

    prismaMock.order.findUnique.mockResolvedValue(order);
    prismaMock.productVariant.findUnique.mockResolvedValue(variant);

    const txMock = {
      orderItem: { create: vi.fn() },
      order: { update: vi.fn() },
      productVariant: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    };
    prismaMock.$transaction.mockImplementation((fn: (tx: any) => any) => fn(txMock));

    const { OrderService } = await import('./order.service');
    const service = new OrderService();

    await expect(
      service.addItemToOrder(1, { variantId: 3, quantity: 1 })
    ).rejects.toThrow('Insufficient stock');
  });
});
