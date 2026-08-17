import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AppError } from '../middleware/error.middleware';
import { DeliveryMethod, PaymentMethod } from '../constants/orderMethods';
import { Prisma } from '../../generated/prisma';

// All prisma, logger, and service dependencies must be mocked before the module is loaded.
const prismaMock = vi.hoisted(() => ({
  user: { update: vi.fn() },
  productVariant: { findMany: vi.fn(), update: vi.fn() },
  order: { create: vi.fn(), findUnique: vi.fn() },
  orderItem: { create: vi.fn() },
  payment: { create: vi.fn() },
  $transaction: vi.fn(),
}));

const logger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

const orderingConstraintsMock = vi.hoisted(() => ({
  getOrderingConstraints: vi.fn(),
}));

const notificationEventsMock = vi.hoisted(() => ({
  notifyOrderCreated: vi.fn(),
}));

vi.mock('../config/database', () => ({ default: prismaMock }));
vi.mock('../utils/logger', () => ({ logger }));
vi.mock('./orderingConstraints.service', () => ({
  OrderingConstraintsService: vi.fn(() => orderingConstraintsMock),
}));
vi.mock('./notificationEvents.service', () => ({
  notificationEventsService: notificationEventsMock,
}));
vi.mock('./store-credit.service', () => ({ default: { useCredit: vi.fn() } }));

// Provide a default-store tenant context so createOrder doesn't throw
// MissingTenantContextError. isDefaultStore=true preserves existing test behaviour.
vi.mock('../config/tenantContext', () => ({
  getTenantContextOrThrow: vi.fn(() => ({
    tenantId: 1,
    storeId: 1,
    isDefaultStore: true,
    scope: 'tenant' as const,
  })),
  getTenantContext: vi.fn(() => ({
    tenantId: 1,
    storeId: 1,
    isDefaultStore: true,
    scope: 'tenant' as const,
  })),
  MissingTenantContextError: class MissingTenantContextError extends Error {
    constructor() {
      super('Execution context is missing active tenantScope. Wrap database operations inside runWithTenant(...) first.');
      this.name = 'MissingTenantContextError';
    }
  },
  runWithTenant: vi.fn((ctx: unknown, fn: () => unknown) => fn()),
}));

describe('order service — IN_STORE payment', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects IN_STORE payment when delivery method is DELIVERY', async () => {
    const { default: orderService } = await import('./order.service');

    await expect(
      orderService.createOrder({
        userId: 1,
        items: [{ variantId: 1, quantity: 1 }],
        deliveryMethod: DeliveryMethod.DELIVERY,
        paymentMethod: PaymentMethod.IN_STORE,
      })
    ).rejects.toMatchObject({
      message: 'Pay in store is only available for pickup and curbside orders',
      statusCode: 400,
    });

    expect(prismaMock.order.create).not.toHaveBeenCalled();
  });

  it('proceeds past the guard when IN_STORE is paired with PICKUP', async () => {
    prismaMock.user.update.mockResolvedValue({});
    prismaMock.productVariant.findMany.mockResolvedValue([
      { id: 7, label: "Default", product: { id: 7, name: "Item" }, basePrice: new Prisma.Decimal(10), stock: new Prisma.Decimal(0), stockEnabled: false, quantityOptions: [], priceBreaks: [] },
    ]);
    orderingConstraintsMock.getOrderingConstraints.mockResolvedValue({
      minimumDeliveryOrder: 35,
      minimumDeliveryOrderEnabled: true,
      deliveryDisabled: false,
    });
    const createdOrder = { id: 42, total: 10.83, status: 'APPROVED', paymentMethod: PaymentMethod.IN_STORE };
    prismaMock.order.create.mockResolvedValue(createdOrder);
    prismaMock.orderItem.create.mockResolvedValue({ id: 1, orderId: 42, variantId: 7, quantity: 1, unitPrice: new Prisma.Decimal(10) });
    prismaMock.$transaction.mockImplementation(async (callback) => callback(prismaMock));
    prismaMock.order.findUnique.mockResolvedValue({ statusEvents: [], payments: [] });
    notificationEventsMock.notifyOrderCreated.mockResolvedValue(undefined);

    const { default: orderService } = await import('./order.service');

    const result = await orderService.createOrder({
      userId: 1,
      items: [{ variantId: 7, quantity: 1 }],
      deliveryMethod: DeliveryMethod.PICKUP,
      paymentMethod: PaymentMethod.IN_STORE,
    });

    expect(result).toMatchObject({ id: 42, status: 'APPROVED' });
    expect(prismaMock.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          deliveryMethod: DeliveryMethod.PICKUP,
          paymentMethod: PaymentMethod.IN_STORE,
        }),
      })
    );
  });
});
