/**
 * Regression matrix — every fulfillment × payment combination that the checkout
 * rewrite (Steps 1-8) touched. Each case asserts that createOrder succeeds and
 * writes the correct status + fulfillment fields to the DB.
 */
import { OrderStatus } from '../../generated/prisma';
import { DeliveryMethod, PaymentMethod } from '../constants/orderMethods';

const prismaMock = vi.hoisted(() => ({
  user: { update: vi.fn() },
  productItem: { findMany: vi.fn(), update: vi.fn() },
  order: { create: vi.fn() },
  orderItem: { create: vi.fn() },
  $transaction: vi.fn(),
}));

const logger = vi.hoisted(() => ({
  info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
}));

const orderingConstraintsMock = vi.hoisted(() => ({
  getOrderingConstraints: vi.fn(),
}));

const deliveryEligibilityMock = vi.hoisted(() => ({
  checkDeliveryEligibility: vi.fn(),
}));

const notificationEventsMock = vi.hoisted(() => ({
  notifyOrderCreated: vi.fn(),
}));

const creditServiceMock = vi.hoisted(() => ({
  useCredit: vi.fn(),
  refundCredit: vi.fn(),
}));

vi.mock('../config/database', () => ({ default: prismaMock }));
vi.mock('../utils/logger', () => ({ logger }));
vi.mock('./orderingConstraints.service', () => ({
  OrderingConstraintsService: vi.fn(() => orderingConstraintsMock),
}));
vi.mock('./deliveryEligibility.service', () => ({
  DeliveryEligibilityService: vi.fn(() => deliveryEligibilityMock),
}));
vi.mock('./notificationEvents.service', () => ({
  notificationEventsService: notificationEventsMock,
}));
vi.mock('./credit.service', () => ({ default: creditServiceMock }));
vi.mock('./thermalPrinter.service', () => ({
  thermalPrinterService: { dispatchReceipt: vi.fn() },
}));

const DELIVERY_ADDRESS = { street: '123 Main St', city: 'Houston', state: 'TX', zipCode: '77001' };
const PRODUCT = {
  id: 1, name: 'Test Product', price: 20, stock: 10, stockEnabled: true,
  allowedQuantitiesOverride: [], quantityDiscountsOverride: null,
  category: { allowedQuantities: [], quantityDiscounts: null },
};

const DELIVERABLE_RESULT = {
  deliverable: true, deliveryZoneStatus: 'IN_ZONE', deliveryZoneSource: 'GOOGLE_GEOCODING',
  distanceMiles: 2, thresholdMiles: 5, message: 'In range',
  canonicalAddress: '123 Main St, Houston, TX 77001', checkedAt: new Date(),
};

type MatrixCase = {
  label: string;
  deliveryMethod: string;
  paymentMethod: string;
  deliveryAddress?: typeof DELIVERY_ADDRESS;
  vehicleDescription?: string;
  creditBalance?: number;
  expectedStatus: OrderStatus;
  expectedFields?: Record<string, unknown>;
};

const matrix: MatrixCase[] = [
  {
    label: 'DELIVERY × EXTERNAL',
    deliveryMethod: DeliveryMethod.DELIVERY,
    paymentMethod: PaymentMethod.EXTERNAL,
    deliveryAddress: DELIVERY_ADDRESS,
    expectedStatus: OrderStatus.PENDING,
    expectedFields: { deliveryAddress: expect.any(String) },
  },
  {
    label: 'DELIVERY × CREDIT',
    deliveryMethod: DeliveryMethod.DELIVERY,
    paymentMethod: PaymentMethod.CREDIT,
    deliveryAddress: DELIVERY_ADDRESS,
    creditBalance: 100,
    expectedStatus: OrderStatus.PENDING,
    expectedFields: { deliveryAddress: expect.any(String) },
  },
  {
    label: 'DELIVERY × CC',
    deliveryMethod: DeliveryMethod.DELIVERY,
    paymentMethod: PaymentMethod.CC,
    deliveryAddress: DELIVERY_ADDRESS,
    expectedStatus: OrderStatus.PENDING_PAYMENT,
    expectedFields: { deliveryAddress: expect.any(String) },
  },
  {
    label: 'PICKUP × EXTERNAL',
    deliveryMethod: DeliveryMethod.PICKUP,
    paymentMethod: PaymentMethod.EXTERNAL,
    expectedStatus: OrderStatus.PENDING,
  },
  {
    label: 'PICKUP × CREDIT',
    deliveryMethod: DeliveryMethod.PICKUP,
    paymentMethod: PaymentMethod.CREDIT,
    creditBalance: 100,
    expectedStatus: OrderStatus.PENDING,
  },
  {
    label: 'PICKUP × IN_STORE',
    deliveryMethod: DeliveryMethod.PICKUP,
    paymentMethod: PaymentMethod.IN_STORE,
    expectedStatus: OrderStatus.PENDING,
  },
  {
    label: 'PICKUP × CC',
    deliveryMethod: DeliveryMethod.PICKUP,
    paymentMethod: PaymentMethod.CC,
    expectedStatus: OrderStatus.PENDING_PAYMENT,
  },
  {
    label: 'CURBSIDE × EXTERNAL',
    deliveryMethod: DeliveryMethod.CURBSIDE,
    paymentMethod: PaymentMethod.EXTERNAL,
    vehicleDescription: 'Silver Toyota Camry',
    expectedStatus: OrderStatus.PENDING,
    expectedFields: { vehicleDescription: 'Silver Toyota Camry' },
  },
  {
    label: 'CURBSIDE × CREDIT',
    deliveryMethod: DeliveryMethod.CURBSIDE,
    paymentMethod: PaymentMethod.CREDIT,
    vehicleDescription: 'Blue Honda Civic',
    creditBalance: 100,
    expectedStatus: OrderStatus.PENDING,
    expectedFields: { vehicleDescription: 'Blue Honda Civic' },
  },
  {
    label: 'CURBSIDE × IN_STORE',
    deliveryMethod: DeliveryMethod.CURBSIDE,
    paymentMethod: PaymentMethod.IN_STORE,
    vehicleDescription: 'Red Ford F-150',
    expectedStatus: OrderStatus.PENDING,
    expectedFields: { vehicleDescription: 'Red Ford F-150' },
  },
  {
    label: 'CURBSIDE × CC',
    deliveryMethod: DeliveryMethod.CURBSIDE,
    paymentMethod: PaymentMethod.CC,
    vehicleDescription: 'White Tesla Model 3',
    expectedStatus: OrderStatus.PENDING_PAYMENT,
    expectedFields: { vehicleDescription: 'White Tesla Model 3' },
  },
];

describe('createOrder — fulfillment × payment matrix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (cb) => cb(prismaMock));
    prismaMock.user.update.mockResolvedValue({});
    prismaMock.productItem.findMany.mockResolvedValue([PRODUCT]);
    prismaMock.productItem.update.mockResolvedValue({});
    prismaMock.orderItem.create.mockResolvedValue({ id: 1, orderId: 99, productId: 1, quantity: 1, price: 20 });
    orderingConstraintsMock.getOrderingConstraints.mockResolvedValue({
      minimumDeliveryOrder: 0,
      minimumDeliveryOrderEnabled: false,
      deliveryRadiusMiles: 5,
      offlineZipFallbackEnabled: false,
      offlineDeliveryZipCodes: [],
    });
    deliveryEligibilityMock.checkDeliveryEligibility.mockResolvedValue(DELIVERABLE_RESULT);
    creditServiceMock.useCredit.mockResolvedValue(undefined);
  });

  it.each(matrix)('$label', async ({ deliveryMethod, paymentMethod, deliveryAddress, vehicleDescription, creditBalance, expectedStatus, expectedFields }) => {
    prismaMock.order.create.mockResolvedValue({
      id: 99, userId: 1, total: 22, status: expectedStatus,
      deliveryMethod, paymentMethod, createdAt: new Date(), updatedAt: new Date(),
    });

    const { OrderService } = await import('./order.service');
    const service = new OrderService();

    await service.createOrder({
      userId: 1,
      items: [{ productId: 1, quantity: 1 }],
      deliveryMethod,
      paymentMethod,
      ...(deliveryAddress ? { deliveryAddress } : {}),
      ...(vehicleDescription ? { vehicleDescription } : {}),
      cashAppUsername: '$test',
    });

    expect(prismaMock.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: expectedStatus,
          deliveryMethod,
          paymentMethod,
          ...(expectedFields ?? {}),
        }),
      })
    );
  });

  it('rejects IN_STORE payment when delivery method is DELIVERY', async () => {
    const { OrderService } = await import('./order.service');
    const service = new OrderService();

    await expect(service.createOrder({
      userId: 1,
      items: [{ productId: 1, quantity: 1 }],
      deliveryMethod: DeliveryMethod.DELIVERY,
      paymentMethod: PaymentMethod.IN_STORE,
      deliveryAddress: DELIVERY_ADDRESS,
    })).rejects.toThrow();

    expect(prismaMock.order.create).not.toHaveBeenCalled();
  });

  it('rejects CURBSIDE order when vehicleDescription is missing', async () => {
    const { OrderService } = await import('./order.service');
    const service = new OrderService();

    await expect(service.createOrder({
      userId: 1,
      items: [{ productId: 1, quantity: 1 }],
      deliveryMethod: DeliveryMethod.CURBSIDE,
      paymentMethod: PaymentMethod.EXTERNAL,
    })).rejects.toThrow('Vehicle description is required');

    expect(prismaMock.order.create).not.toHaveBeenCalled();
  });

  it('rejects DELIVERY order when address is out of zone', async () => {
    deliveryEligibilityMock.checkDeliveryEligibility.mockResolvedValue({
      deliverable: false, deliveryZoneStatus: 'OUT_OF_ZONE',
      deliveryZoneSource: 'GOOGLE_GEOCODING', distanceMiles: 9, thresholdMiles: 5,
      message: 'Outside delivery area', checkedAt: new Date(),
    });

    const { OrderService } = await import('./order.service');
    const service = new OrderService();

    await expect(service.createOrder({
      userId: 1,
      items: [{ productId: 1, quantity: 1 }],
      deliveryMethod: DeliveryMethod.DELIVERY,
      paymentMethod: PaymentMethod.EXTERNAL,
      deliveryAddress: DELIVERY_ADDRESS,
    })).rejects.toThrow('Outside delivery area');

    expect(prismaMock.order.create).not.toHaveBeenCalled();
  });
});
