import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import { OrderStatus, Prisma } from '../../generated/prisma';
const D = (n: number) => new Prisma.Decimal(n);
import { PaymentMethod } from '../constants/orderMethods';


// ── Shared mocks ──────────────────────────────────────────────────────────────

const prismaMock = {
  order: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  payment: {
    findFirst: vi.fn(),
  },
  $transaction: vi.fn(),
};

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

const paymentSettingsInstance = { getPaymentSettings: vi.fn() };
const authorizeNetServiceMock = {
  getHostedPageToken: vi.fn(),
  verifyTransaction: vi.fn(),
};
const notificationEventsService = {
  notifyOrderCreated: vi.fn(),
  notifyOrderStatusUpdated: vi.fn(),
};
const thermalPrinterService = { dispatchReceipt: vi.fn() };

vi.mock('../config/database', () => ({ default: prismaMock }));
vi.mock('../utils/logger', () => ({ logger }));
vi.mock('./paymentSettings.service', () => ({
  PaymentSettingsService: vi.fn(() => paymentSettingsInstance),
  default: {
    PaymentSettingsService: vi.fn(() => paymentSettingsInstance),
  }
}));
vi.mock('./authorizenet.service', () => ({
  default: authorizeNetServiceMock,
  authorizeNetService: authorizeNetServiceMock,
}));
vi.mock('./notificationEvents.service', () => ({ notificationEventsService }));
vi.mock('./thermalPrinter.service', () => ({ thermalPrinterService }));
vi.mock('./store-credit.service', () => ({ default: { useCredit: vi.fn(), refundCredit: vi.fn() } }));
vi.mock('./orderingConstraints.service', () => ({
  OrderingConstraintsService: vi.fn(() => ({ getOrderingConstraints: vi.fn() })),
}));
vi.mock('./deliveryEligibility.service', () => ({
  DeliveryEligibilityService: vi.fn(() => ({ checkDeliveryEligibility: vi.fn() })),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const enabledCCSettings = {
  enabled: true,
  loginId: 'login123',
  transactionKey: 'txnkey456',
  sandboxMode: true,
};

const basePendingOrder = {
  id: 42,
  userId: 7,
  total: D(35.50),
  paymentMethod: PaymentMethod.CC,
  status: OrderStatus.PENDING_PAYMENT,
};

beforeAll(async () => {
  await import('../subscribers/order.subscriber');
});

// ── getPaymentToken ───────────────────────────────────────────────────────────

describe('getPaymentToken', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws 404 when the order does not exist', async () => {
    prismaMock.order.findUnique.mockResolvedValue(null);
    const { OrderService } = await import('./order.service');
    await expect(new OrderService().getPaymentToken(99, 7)).rejects.toMatchObject({
      statusCode: 404,
      message: 'Order not found',
    });
  });

  it('throws 403 when the order belongs to a different user', async () => {
    prismaMock.order.findUnique.mockResolvedValue({ ...basePendingOrder, userId: 99 });
    const { OrderService } = await import('./order.service');
    await expect(new OrderService().getPaymentToken(42, 7)).rejects.toMatchObject({
      statusCode: 403,
      message: 'Not authorized',
    });
  });

  it('throws 400 when the order payment method is not CC', async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      ...basePendingOrder,
      paymentMethod: PaymentMethod.EXTERNAL,
    });
    const { OrderService } = await import('./order.service');
    await expect(new OrderService().getPaymentToken(42, 7)).rejects.toMatchObject({
      statusCode: 400,
      message: 'Order is not a card payment',
    });
  });

  it('throws 400 when the order is not in PENDING_PAYMENT status', async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      ...basePendingOrder,
      status: OrderStatus.PENDING,
    });
    const { OrderService } = await import('./order.service');
    await expect(new OrderService().getPaymentToken(42, 7)).rejects.toMatchObject({
      statusCode: 400,
      message: 'Order is not awaiting payment',
    });
  });

  it('throws 400 when CC payments are disabled in settings', async () => {
    prismaMock.order.findUnique.mockResolvedValue(basePendingOrder);
    paymentSettingsInstance.getPaymentSettings.mockResolvedValue({
      cc_payment: { ...enabledCCSettings, enabled: false },
    });
    const { OrderService } = await import('./order.service');
    await expect(new OrderService().getPaymentToken(42, 7)).rejects.toMatchObject({
      statusCode: 400,
      message: 'Card payments are not enabled',
    });
  });

  it('returns the sandbox payment form URL and token when sandboxMode is true', async () => {
    prismaMock.order.findUnique.mockResolvedValue(basePendingOrder);
    paymentSettingsInstance.getPaymentSettings.mockResolvedValue({
      cc_payment: { ...enabledCCSettings, sandboxMode: true },
    });
    authorizeNetServiceMock.getHostedPageToken.mockResolvedValue('tok_sandbox');
    process.env.CORS_ORIGIN = 'https://shop.example.com';

    const { OrderService } = await import('./order.service');
    const result = await new OrderService().getPaymentToken(42, 7);

    delete process.env.CORS_ORIGIN;
    // Accept Hosted requires the token to be POSTed as a form field, not passed
    // as a GET query param — so the service returns the bare form action URL.
    expect(result.token).toBe('tok_sandbox');
    expect(result.paymentFormUrl).toBe('https://test.authorize.net/payment/payment');
  });

  it('returns the production payment form URL when sandboxMode is false', async () => {
    prismaMock.order.findUnique.mockResolvedValue(basePendingOrder);
    paymentSettingsInstance.getPaymentSettings.mockResolvedValue({
      cc_payment: { ...enabledCCSettings, sandboxMode: false },
    });
    authorizeNetServiceMock.getHostedPageToken.mockResolvedValue('tok_live');
    process.env.CORS_ORIGIN = 'https://shop.example.com';

    const { OrderService } = await import('./order.service');
    const result = await new OrderService().getPaymentToken(42, 7);

    delete process.env.CORS_ORIGIN;
    expect(result.token).toBe('tok_live');
    expect(result.paymentFormUrl).toBe('https://accept.authorize.net/payment/payment');
  });

  it('uses CORS_ORIGIN for the communicatorUrl passed to the Authorize.Net service', async () => {
    prismaMock.order.findUnique.mockResolvedValue(basePendingOrder);
    paymentSettingsInstance.getPaymentSettings.mockResolvedValue({ cc_payment: enabledCCSettings });
    authorizeNetServiceMock.getHostedPageToken.mockResolvedValue('tok_abc');
    process.env.CORS_ORIGIN = 'https://shop.example.com';

    const { OrderService } = await import('./order.service');
    await new OrderService().getPaymentToken(42, 7);

    expect(authorizeNetServiceMock.getHostedPageToken).toHaveBeenCalledWith(
      42,
      basePendingOrder.total.toNumber(),
      'https://shop.example.com/communicator.html',
      enabledCCSettings,
    );

    delete process.env.CORS_ORIGIN;
  });

  it('throws 503 when CORS_ORIGIN is not configured', async () => {
    prismaMock.order.findUnique.mockResolvedValue(basePendingOrder);
    paymentSettingsInstance.getPaymentSettings.mockResolvedValue({ cc_payment: enabledCCSettings });
    delete process.env.CORS_ORIGIN;

    const { OrderService } = await import('./order.service');
    await expect(
      new OrderService().getPaymentToken(42, 7)
    ).rejects.toMatchObject({ statusCode: 503, message: expect.stringContaining('CORS_ORIGIN') });
  });
});

// ── confirmCardPayment ────────────────────────────────────────────────────────

describe('confirmCardPayment', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws 404 when the order does not exist', async () => {
    prismaMock.order.findUnique.mockResolvedValue(null);
    const { OrderService } = await import('./order.service');
    await expect(new OrderService().confirmCardPayment(99, 7, 'txn_abc')).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('throws 403 when the order belongs to a different user', async () => {
    prismaMock.order.findUnique.mockResolvedValue({ ...basePendingOrder, userId: 99 });
    const { OrderService } = await import('./order.service');
    await expect(new OrderService().confirmCardPayment(42, 7, 'txn_abc')).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('throws 400 when the order payment method is not CC', async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      ...basePendingOrder,
      paymentMethod: PaymentMethod.EXTERNAL,
    });
    const { OrderService } = await import('./order.service');
    await expect(new OrderService().confirmCardPayment(42, 7, 'txn_abc')).rejects.toMatchObject({
      statusCode: 400,
      message: 'Order is not a card payment',
    });
  });

  it('throws 400 when the order is not in PENDING_PAYMENT status', async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      ...basePendingOrder,
      status: OrderStatus.PENDING,
    });
    const { OrderService } = await import('./order.service');
    await expect(new OrderService().confirmCardPayment(42, 7, 'txn_abc')).rejects.toMatchObject({
      statusCode: 400,
      message: 'Order is not awaiting payment',
    });
  });

  it('throws 400 on replay: same transactionId already applied to another order', async () => {
    prismaMock.order.findUnique.mockResolvedValue(basePendingOrder);
    prismaMock.payment.findFirst.mockResolvedValue({ id: 99, orderId: 99 }); // existing payment with same transId
    const { OrderService } = await import('./order.service');
    await expect(new OrderService().confirmCardPayment(42, 7, 'txn_dup')).rejects.toMatchObject({
      statusCode: 400,
      message: 'This payment has already been applied to another order',
    });
  });

  it('calls verifyTransaction with transId, total, orderId, and CC settings', async () => {
    prismaMock.order.findUnique.mockResolvedValue(basePendingOrder);
    prismaMock.payment.findFirst.mockResolvedValue(null);
    prismaMock.order.update.mockResolvedValue({ id: 42, status: OrderStatus.PENDING });
    paymentSettingsInstance.getPaymentSettings.mockResolvedValue({ cc_payment: enabledCCSettings });
    authorizeNetServiceMock.verifyTransaction.mockResolvedValue(undefined);
    notificationEventsService.notifyOrderCreated.mockResolvedValue(undefined);
    thermalPrinterService.dispatchReceipt.mockResolvedValue(undefined);

    const { OrderService } = await import('./order.service');
    await new OrderService().confirmCardPayment(42, 7, 'txn_ok');

    expect(authorizeNetServiceMock.verifyTransaction).toHaveBeenCalledWith(
      'txn_ok',
      basePendingOrder.total.toNumber(),
      42,
      enabledCCSettings,
    );
  });

  it('transitions order to PENDING (no longer sets transactionId on Order)', async () => {
    prismaMock.order.findUnique.mockResolvedValue(basePendingOrder);
    prismaMock.payment.findFirst.mockResolvedValue(null);
    prismaMock.order.update.mockResolvedValue({ id: 42, status: OrderStatus.PENDING });
    paymentSettingsInstance.getPaymentSettings.mockResolvedValue({ cc_payment: enabledCCSettings });
    authorizeNetServiceMock.verifyTransaction.mockResolvedValue(undefined);
    notificationEventsService.notifyOrderCreated.mockResolvedValue(undefined);
    thermalPrinterService.dispatchReceipt.mockResolvedValue(undefined);

    const { OrderService } = await import('./order.service');
    await new OrderService().confirmCardPayment(42, 7, 'txn_ok');

    expect(prismaMock.order.update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: { status: OrderStatus.PENDING },
    });
  });

  it('fires order-created notification and thermal receipt after confirmation', async () => {
    prismaMock.order.findUnique.mockResolvedValue(basePendingOrder);
    prismaMock.payment.findFirst.mockResolvedValue(null);
    prismaMock.order.update.mockResolvedValue({ id: 42, status: OrderStatus.PENDING });
    paymentSettingsInstance.getPaymentSettings.mockResolvedValue({ cc_payment: enabledCCSettings });
    authorizeNetServiceMock.verifyTransaction.mockResolvedValue(undefined);
    notificationEventsService.notifyOrderCreated.mockResolvedValue(undefined);
    thermalPrinterService.dispatchReceipt.mockResolvedValue(undefined);

    const { OrderService } = await import('./order.service');
    await new OrderService().confirmCardPayment(42, 7, 'txn_ok');

    expect(notificationEventsService.notifyOrderCreated).toHaveBeenCalledWith(42, 7);
    expect(thermalPrinterService.dispatchReceipt).toHaveBeenCalledWith(42, 'ORDER_CREATED', { userId: 7 });
  });

  it('does not throw if the thermal printer dispatch fails after confirmation', async () => {
    prismaMock.order.findUnique.mockResolvedValue(basePendingOrder);
    prismaMock.payment.findFirst.mockResolvedValue(null);
    prismaMock.order.update.mockResolvedValue({ id: 42, status: OrderStatus.PENDING });
    paymentSettingsInstance.getPaymentSettings.mockResolvedValue({ cc_payment: enabledCCSettings });
    authorizeNetServiceMock.verifyTransaction.mockResolvedValue(undefined);
    notificationEventsService.notifyOrderCreated.mockResolvedValue(undefined);
    thermalPrinterService.dispatchReceipt.mockRejectedValue(new Error('Printer offline'));

    const { OrderService } = await import('./order.service');
    await expect(new OrderService().confirmCardPayment(42, 7, 'txn_ok'))
      .resolves.toMatchObject({ id: 42, status: OrderStatus.PENDING });
  });
});
