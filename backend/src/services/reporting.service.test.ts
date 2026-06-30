import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OrderStatus, PaymentMethodEnum, Prisma } from '../../generated/prisma';

const D = (n: number) => new Prisma.Decimal(n);

// ─── fixtures ────────────────────────────────────────────────────────────────

const makeVariant = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  productId: 10,
  label: 'Default',
  sku: 'sku-001',
  pricingMode: 'UNIT',
  basePrice: D(25),
  stock: D(5),
  stockEnabled: true,
  active: true,
  sortOrder: 0,
  isDefault: true,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-06-01'),
  product: {
    id: 10,
    name: 'Premium Flower',
    description: 'Top shelf',
    categoryId: 2,
    hidden: false,
    category: { id: 2, name: 'Flower' },
  },
  ...overrides,
});

const makeOrder = (overrides: Record<string, unknown> = {}) => ({
  id: 100,
  userId: 5,
  status: OrderStatus.PENDING as OrderStatus,
  subtotal: D(25),
  tax: D(0),
  deliveryFee: D(0),
  discountTotal: D(0),
  total: D(25),
  taxRate: D(0),
  deliveryMethod: 'DELIVERY',
  paymentMethod: PaymentMethodEnum.EXTERNAL as PaymentMethodEnum,
  transactionId: null,
  deliveryAddress: null,
  vehicleDescription: null,
  parkingSpot: null,
  deliveryStatus: null,
  deliverySource: null,
  deliveryDistanceMiles: null,
  createdAt: new Date('2025-06-01'),
  updatedAt: new Date('2025-06-01'),
  ...overrides,
});

const makeOrderItem = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  orderId: 100,
  variantId: 1,
  productName: 'Premium Flower',
  variantLabel: 'Default',
  quantity: 1,
  unitPrice: D(25),
  voided: false,
  addedAfterSubmission: false,
  createdAt: new Date('2025-06-01'),
  ...overrides,
});

// ─── mocks ───────────────────────────────────────────────────────────────────

const prismaMock = {
  productVariant: { findMany: vi.fn() },
  category: { findMany: vi.fn() },
  order: { findMany: vi.fn() },
  orderItem: { findMany: vi.fn() },
  user: { findMany: vi.fn() },
};

vi.mock('../config/database', () => ({ default: prismaMock }));
vi.mock('../utils/reportingConfig', () => ({
  getReportingConfig: () => ({
    providerKey: 'test',
    sourceSystem: 'test',
    sourceDisplayName: 'Test',
    schemaVersion: '1',
    timezone: 'UTC',
    currency: 'USD',
    maxPageSize: 100,
    defaultPageSize: 50,
    includeCustomers: false,
    includePaymentDetails: false,
  }),
}));
vi.mock('../utils/reportingTime', () => ({
  toUtcIso: (d: Date | null) => (d ? d.toISOString() : null),
}));

// Reporting resolves the tenant's timezone/currency from store settings.
const getStoreSettingsMock = vi.hoisted(() => vi.fn());
vi.mock('./storeSettings.service', () => ({
  StoreSettingsService: vi.fn(() => ({ getStoreSettings: getStoreSettingsMock })),
}));

const { ReportingService } = await import('./reporting.service');

// ─── tests ───────────────────────────────────────────────────────────────────

describe('ReportingService', () => {
  let service: InstanceType<typeof ReportingService>;

  beforeEach(() => {
    service = new ReportingService();
    vi.clearAllMocks();
    // Default: tenant has not set a locale → reporting falls back to config defaults.
    getStoreSettingsMock.mockResolvedValue({ timezone: '', currency: '' });
  });

  describe('getMetadata', () => {
    it('reports the tenant timezone + currency, falling back to defaults when unset', async () => {
      getStoreSettingsMock.mockResolvedValue({ timezone: 'Europe/Paris', currency: 'EUR' });
      const meta = await service.getMetadata();
      expect(meta.store_timezone).toBe('Europe/Paris');
      expect(meta.currency).toBe('EUR');

      getStoreSettingsMock.mockResolvedValue({ timezone: '', currency: '' });
      const fallback = await service.getMetadata();
      expect(fallback.store_timezone).toBe('UTC'); // config defaults from the mocked reportingConfig
      expect(fallback.currency).toBe('USD');
    });
  });

  describe('listProducts', () => {
    it('queries productVariant (not productItem)', async () => {
      prismaMock.productVariant.findMany.mockResolvedValue([makeVariant()]);
      await service.listProducts({ skip: 0, take: 50 }, {});
      expect(prismaMock.productVariant.findMany).toHaveBeenCalledOnce();
    });

    it('returns product with name, price, and sku from variant', async () => {
      prismaMock.productVariant.findMany.mockResolvedValue([makeVariant()]);
      const [product] = await service.listProducts({ skip: 0, take: 50 }, {});
      expect(product.name).toBe('Premium Flower');
      expect(product.sku).toBe('sku-001');
      expect(product.price).toBe(25);
    });

    it('returns inventory_quantity from variant stock (Decimal → number)', async () => {
      prismaMock.productVariant.findMany.mockResolvedValue([makeVariant({ stock: D(12), stockEnabled: true })]);
      const [product] = await service.listProducts({ skip: 0, take: 50 }, {});
      expect(product.inventory_quantity).toBe(12);
    });

    it('returns null inventory_quantity when stockEnabled is false', async () => {
      prismaMock.productVariant.findMany.mockResolvedValue([makeVariant({ stockEnabled: false })]);
      const [product] = await service.listProducts({ skip: 0, take: 50 }, {});
      expect(product.inventory_quantity).toBeNull();
    });

    it('marks archived when product is hidden', async () => {
      prismaMock.productVariant.findMany.mockResolvedValue([
        makeVariant({ product: { id: 10, name: 'Hidden', description: null, categoryId: 2, hidden: true, category: null } }),
      ]);
      const [product] = await service.listProducts({ skip: 0, take: 50 }, {});
      expect(product.status).toBe('archived');
    });

    it('marks archived when variant is inactive', async () => {
      prismaMock.productVariant.findMany.mockResolvedValue([makeVariant({ active: false })]);
      const [product] = await service.listProducts({ skip: 0, take: 50 }, {});
      expect(product.status).toBe('archived');
    });
  });

  describe('listInventorySnapshots', () => {
    it('queries productVariant', async () => {
      prismaMock.productVariant.findMany.mockResolvedValue([makeVariant()]);
      await service.listInventorySnapshots({ skip: 0, take: 50 }, {});
      expect(prismaMock.productVariant.findMany).toHaveBeenCalledOnce();
    });

    it('converts Decimal stock to number', async () => {
      prismaMock.productVariant.findMany.mockResolvedValue([makeVariant({ stock: D(7) })]);
      const [snap] = await service.listInventorySnapshots({ skip: 0, take: 50 }, {});
      expect(snap.quantity_on_hand).toBe(7);
      expect(snap.quantity_available).toBe(7);
    });
  });

  describe('listOrders', () => {
    const setupOrderMocks = (items = [makeOrderItem()]) => {
      prismaMock.order.findMany.mockResolvedValue([makeOrder()]);
      prismaMock.orderItem.findMany.mockResolvedValue(items);
      prismaMock.productVariant.findMany.mockResolvedValue([makeVariant()]);
      prismaMock.user.findMany.mockResolvedValue([{ id: 5 }]);
    };

    it('looks up productVariant by variantId (not productItem by productId)', async () => {
      setupOrderMocks();
      await service.listOrders({ skip: 0, take: 50 }, {});
      expect(prismaMock.productVariant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: [1] } } })
      );
    });

    it('uses productName from OrderItem snapshot for line item name', async () => {
      setupOrderMocks([makeOrderItem({ productName: 'Snapshot Name' })]);
      const [order] = await service.listOrders({ skip: 0, take: 50 }, {});
      expect(order.line_items[0].name_snapshot).toBe('Snapshot Name');
    });

    it('converts Decimal unitPrice to number for line item unit_price', async () => {
      setupOrderMocks([makeOrderItem({ unitPrice: D(12.5) })]);
      const [order] = await service.listOrders({ skip: 0, take: 50 }, {});
      expect(order.line_items[0].unit_price).toBe(12.5);
    });

    it('converts Decimal order.total to number for grand_total', async () => {
      setupOrderMocks();
      const [order] = await service.listOrders({ skip: 0, take: 50 }, {});
      expect(order.grand_total).toBe(25);
    });

    it('converts Decimal order.total to number in payments amount', async () => {
      setupOrderMocks();
      prismaMock.order.findMany.mockResolvedValue([makeOrder({ status: OrderStatus.READY_FOR_DELIVERY })]);
      const [order] = await service.listOrders({ skip: 0, take: 50 }, {});
      expect(order.payments[0].amount).toBe(25);
    });

    it('uses the tenant store-settings currency for order + payment payloads', async () => {
      setupOrderMocks();
      prismaMock.order.findMany.mockResolvedValue([makeOrder({ status: OrderStatus.READY_FOR_DELIVERY })]);
      getStoreSettingsMock.mockResolvedValue({ timezone: 'Europe/Paris', currency: 'EUR' });
      const [order] = await service.listOrders({ skip: 0, take: 50 }, {});
      expect(order.currency).toBe('EUR');
      expect(order.payments[0].currency).toBe('EUR');
    });

    it('falls back to the platform default currency when the tenant has not set one', async () => {
      setupOrderMocks();
      prismaMock.order.findMany.mockResolvedValue([makeOrder({ status: OrderStatus.READY_FOR_DELIVERY })]);
      getStoreSettingsMock.mockResolvedValue({ timezone: '', currency: '' });
      const [order] = await service.listOrders({ skip: 0, take: 50 }, {});
      expect(order.currency).toBe('USD'); // the config default from the mocked reportingConfig
    });

    it('sets line item gross_sales to 0 when voided', async () => {
      setupOrderMocks([makeOrderItem({ voided: true })]);
      const [order] = await service.listOrders({ skip: 0, take: 50 }, {});
      expect(order.line_items[0].net_sales).toBe(0);
      expect(order.line_items[0].status).toBe('voided');
    });
  });

  describe('payment method mapping', () => {
    it('maps STORE_CREDIT (not CREDIT) to store_credit type', async () => {
      setupOrderWithPaymentMethod(PaymentMethodEnum.STORE_CREDIT);
      const [order] = await service.listOrders({ skip: 0, take: 50 }, {});
      expect(order.payments[0].payment_type).toBe('store_credit');
      expect(order.payments[0].provider).toBe('store_credit');
    });

    it('maps CC to card / authorize_net', async () => {
      setupOrderWithPaymentMethod(PaymentMethodEnum.CC);
      const [order] = await service.listOrders({ skip: 0, take: 50 }, {});
      expect(order.payments[0].payment_type).toBe('card');
      expect(order.payments[0].provider).toBe('authorize_net');
    });

    it('maps EXTERNAL to external / manual', async () => {
      setupOrderWithPaymentMethod(PaymentMethodEnum.EXTERNAL);
      const [order] = await service.listOrders({ skip: 0, take: 50 }, {});
      expect(order.payments[0].payment_type).toBe('external');
      expect(order.payments[0].provider).toBe('manual');
    });

    it('maps IN_STORE to in_store / manual', async () => {
      setupOrderWithPaymentMethod(PaymentMethodEnum.IN_STORE);
      const [order] = await service.listOrders({ skip: 0, take: 50 }, {});
      expect(order.payments[0].payment_type).toBe('in_store');
      expect(order.payments[0].provider).toBe('manual');
    });

    function setupOrderWithPaymentMethod(method: PaymentMethodEnum) {
      prismaMock.order.findMany.mockResolvedValue([
        makeOrder({ paymentMethod: method, status: OrderStatus.READY_FOR_DELIVERY }),
      ]);
      prismaMock.orderItem.findMany.mockResolvedValue([makeOrderItem()]);
      prismaMock.productVariant.findMany.mockResolvedValue([makeVariant()]);
      prismaMock.user.findMany.mockResolvedValue([{ id: 5 }]);
    }
  });
});
