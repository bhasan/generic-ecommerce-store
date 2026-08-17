import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Prisma } from '../../generated/prisma';

const D = (n: number) => new Prisma.Decimal(n);

const prismaMock = {
  order: {
    findUnique: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
  },
  orderItem: {
    findMany: vi.fn(),
  },
  productItem: {
    findMany: vi.fn(),
  },
};

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

const printJobService = {
  createPrintJob: vi.fn(),
};

vi.mock('../config/database', () => ({
  default: prismaMock,
}));

vi.mock('../utils/logger', () => ({
  logger,
}));

vi.mock('./printJob.service', () => ({
  printJobService,
}));

describe('thermal printer service', () => {
  const originalEnv = {
    storeName: process.env.THERMAL_PRINTER_STORE_NAME,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.THERMAL_PRINTER_STORE_NAME = 'Generic Ecommerce Store Test';
    printJobService.createPrintJob.mockResolvedValue({
      id: 501,
      orderId: 81,
      reason: 'ORDER_CREATED',
      status: 'PENDING',
    });
  });

  afterEach(() => {
    process.env.THERMAL_PRINTER_STORE_NAME = originalEnv.storeName;
    vi.unstubAllGlobals();
  });

  const mockPickupOrder = () => {
    prismaMock.order.findUnique.mockResolvedValue({
      id: 81,
      userId: 5,
      status: 'PENDING',
      total: D(21.64),
      createdAt: new Date('2026-04-09T15:00:00.000Z'),
      updatedAt: new Date('2026-04-09T15:00:00.000Z'),
      deliveryMethod: 'PICKUP',
      paymentMethod: 'EXTERNAL',
      deliveryAddress: null,
    });
    prismaMock.user.findUnique.mockResolvedValue({
      id: 5,
      username: 'customer-one',
      cashapp: '$customer-one',
      phoneNumber: '555-111-2222',
      address: '123 Main St',
    });
  };

  it('queues a receipt payload as a pending print job', async () => {
    mockPickupOrder();
    prismaMock.orderItem.findMany.mockResolvedValue([
      { id: 1, orderId: 81, variantId: 2, productName: 'Blue Dream', variantLabel: 'Default', quantity: 2, unitPrice: D(10.82), voided: false, addedAfterSubmission: false, variant: { product: { category: { name: 'Flower' } } } },
    ]);

    const { thermalPrinterService } = await import('./thermalPrinter.service');

    const result = await thermalPrinterService.dispatchReceipt(81, 'ORDER_CREATED', {
      userId: 5,
      username: 'customer-one',
    });

    expect(result).toEqual({
      queued: true,
      reason: 'ORDER_CREATED',
      orderId: 81,
    });
    expect(printJobService.createPrintJob).toHaveBeenCalledTimes(1);
    expect(printJobService.createPrintJob).toHaveBeenCalledWith({
      orderId: 81,
      reason: 'ORDER_CREATED',
      payload: expect.any(Object),
    });

    const body = printJobService.createPrintJob.mock.calls[0][0].payload;
    expect(body.eventType).toBe('ORDER_RECEIPT_PRINT_REQUESTED');
    expect(body.order.id).toBe(81);
    expect(body.receipt.templateType).toBe('STAFF_TICKET');
    expect(body.printer.width).toBe(42);
    expect(body.order.items[0]).toMatchObject({
      variantId: 2,
      productName: 'Blue Dream',
      categoryName: 'Flower',
    });
    expect(body.receipt.text).toContain('ORDER #81');
    expect(body.receipt.text).toContain('*** PICKUP ***');
    expect(body.receipt.text).toContain('CUSTOMER customer-one');
    expect(body.receipt.text).toContain('PHONE 555-111-2222');
    expect(body.receipt.text).toContain('BLUE DREAM');
    expect(body.receipt.text).toContain('TOTAL');
    const normalizedReceiptText = body.receipt.text.replace(/CREATED .+/, 'CREATED <LOCAL_TIME>');
    expect(normalizedReceiptText).toMatchInlineSnapshot(`
"            SMOKE STATION TEST
                NEW ORDER
==========================================
ORDER #81
CREATED <LOCAL_TIME>
==========================================
              *** PICKUP ***

CUSTOMER customer-one
PHONE 555-111-2222

ITEMS
------------------------------------------
BLUE DREAM
2 x $10.82 = $21.64
------------------------------------------
TOTAL                               $21.64
"
`);
  });

  it('prints delivery orders with emphasized address near the top', async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      id: 91,
      userId: 7,
      status: 'APPROVED',
      total: D(32.5),
      createdAt: new Date('2026-04-09T18:30:00.000Z'),
      updatedAt: new Date('2026-04-09T18:30:00.000Z'),
      deliveryMethod: 'DELIVERY',
      paymentMethod: 'EXTERNAL',
      deliveryAddress: '742 Evergreen Terrace, Springfield, IL 62704',
    });
    prismaMock.user.findUnique.mockResolvedValue({
      id: 7,
      username: 'homer',
      cashapp: null,
      phoneNumber: '555-333-9999',
      address: '742 Evergreen Terrace, Springfield, IL 62704',
    });
    prismaMock.orderItem.findMany.mockResolvedValue([
      { id: 4, orderId: 91, variantId: 9, productName: 'House Special', variantLabel: 'Default', quantity: 1, unitPrice: D(32.5), voided: false, addedAfterSubmission: false, variant: { product: { category: { name: 'Bundle' } } } },
    ]);

    const { thermalPrinterService } = await import('./thermalPrinter.service');
    await thermalPrinterService.dispatchReceipt(91, 'ORDER_CREATED');

    const body = printJobService.createPrintJob.mock.calls[0][0].payload;
    const lines = body.receipt.text.split('\n');
    const deliveryIndex = lines.findIndex((line: string) => line.includes('*** DELIVERY ***'));
    const addressIndex = lines.findIndex((line: string) => line.includes('742 EVERGREEN TERRACE'));

    expect(deliveryIndex).toBeGreaterThan(-1);
    expect(addressIndex).toBeGreaterThan(deliveryIndex);
    expect(addressIndex - deliveryIndex).toBeLessThan(6);
    expect(body.receipt.text).toContain('DELIVERY ADDRESS');
  });

  it('prints curbside pickup orders with vehicle info section (new vehicleDescription column)', async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      id: 95,
      userId: 8,
      status: 'APPROVED',
      total: D(15.0),
      createdAt: new Date('2026-04-09T19:00:00.000Z'),
      updatedAt: new Date('2026-04-09T19:00:00.000Z'),
      deliveryMethod: 'CURBSIDE',
      paymentMethod: 'EXTERNAL',
      deliveryAddress: null,
      vehicleDescription: 'Silver Camry',
    });
    prismaMock.user.findUnique.mockResolvedValue({
      id: 8,
      username: 'customer-two',
      cashapp: '$customer-two',
      phoneNumber: '555-222-3333',
      address: '456 Side St',
    });
    prismaMock.orderItem.findMany.mockResolvedValue([
      { id: 5, orderId: 95, variantId: 2, productName: 'Blue Dream', variantLabel: 'Default', quantity: 1, unitPrice: D(15.0), voided: false, addedAfterSubmission: false, variant: { product: { category: { name: 'Flower' } } } },
    ]);

    const { thermalPrinterService } = await import('./thermalPrinter.service');
    await thermalPrinterService.dispatchReceipt(95, 'ORDER_CREATED');

    const body = printJobService.createPrintJob.mock.calls[0][0].payload;
    expect(body.receipt.text).toContain('*** CURBSIDE PICKUP ***');
    expect(body.receipt.text).toContain('CURBSIDE VEHICLE INFO');
    expect(body.receipt.text).toContain('SILVER CAMRY');
  });


  it('marks manual reprints clearly', async () => {
    mockPickupOrder();
    prismaMock.orderItem.findMany.mockResolvedValue([
      { id: 1, orderId: 81, variantId: 2, productName: 'Blue Dream', variantLabel: 'Default', quantity: 2, unitPrice: D(10.82), voided: false, addedAfterSubmission: false, variant: { product: { category: { name: 'Flower' } } } },
    ]);

    const { thermalPrinterService } = await import('./thermalPrinter.service');
    await thermalPrinterService.dispatchReceipt(81, 'MANUAL_REPRINT');

    const body = printJobService.createPrintJob.mock.calls[0][0].payload;
    expect(body.receipt.text).toContain('REPRINT');
    expect(body.receipt.text).not.toContain('NEW ORDER');
  });

  it('wraps long product names and flags added-later items', async () => {
    mockPickupOrder();
    prismaMock.orderItem.findMany.mockResolvedValue([
      { id: 7, orderId: 81, variantId: 3, productName: 'Extremely Long Product Name That Should Wrap Across Multiple Receipt Lines Cleanly', variantLabel: 'Default', quantity: 1, unitPrice: D(12), voided: false, addedAfterSubmission: true, variant: { product: { category: { name: 'Edibles' } } } },
    ]);

    const { thermalPrinterService } = await import('./thermalPrinter.service');
    await thermalPrinterService.dispatchReceipt(81, 'ORDER_CREATED');

    const body = printJobService.createPrintJob.mock.calls[0][0].payload;
    const lines = body.receipt.text.split('\n');
    const wrappedNameLines = lines.filter((line: string) => line.includes('EXTREMELY') || line.includes('MULTIPLE RECEIPT'));

    expect(wrappedNameLines.length).toBeGreaterThan(1);
    expect(body.receipt.text).toContain('[ADDED LATER]');
  });

  it('omits voided items from active fulfillment lines', async () => {
    mockPickupOrder();
    prismaMock.orderItem.findMany.mockResolvedValue([
      { id: 8, orderId: 81, variantId: 4, productName: 'Voided Item', variantLabel: 'Default', quantity: 1, unitPrice: D(9.5), voided: true, addedAfterSubmission: false, variant: { product: { category: { name: 'Accessories' } } } },
      { id: 9, orderId: 81, variantId: 5, productName: 'Active Item', variantLabel: 'Default', quantity: 2, unitPrice: D(6), voided: false, addedAfterSubmission: false, variant: { product: { category: { name: 'Flower' } } } },
    ]);

    const { thermalPrinterService } = await import('./thermalPrinter.service');
    await thermalPrinterService.dispatchReceipt(81, 'ORDER_CREATED');

    const body = printJobService.createPrintJob.mock.calls[0][0].payload;
    expect(body.receipt.text).toContain('ACTIVE ITEM');
    expect(body.receipt.text).not.toContain('VOIDED ITEM');
  });

  it('shows a safe fallback when all items are voided', async () => {
    mockPickupOrder();
    prismaMock.orderItem.findMany.mockResolvedValue([
      { id: 8, orderId: 81, variantId: 4, productName: 'Voided Item', variantLabel: 'Default', quantity: 1, unitPrice: D(9.5), voided: true, addedAfterSubmission: false, variant: { product: { category: { name: 'Accessories' } } } },
    ]);

    const { thermalPrinterService } = await import('./thermalPrinter.service');
    await thermalPrinterService.dispatchReceipt(81, 'ORDER_CREATED');

    const body = printJobService.createPrintJob.mock.calls[0][0].payload;
    expect(body.receipt.text).toContain('NO ACTIVE ITEMS');
  });

  it('keeps decimal quantities stable in the printed line items', async () => {
    mockPickupOrder();
    prismaMock.orderItem.findMany.mockResolvedValue([
      { id: 10, orderId: 81, variantId: 6, productName: 'Half Gram Example', variantLabel: 'Default', quantity: 0.5, unitPrice: D(14), voided: false, addedAfterSubmission: false, variant: { product: { category: { name: 'Concentrates' } } } },
    ]);

    const { thermalPrinterService } = await import('./thermalPrinter.service');
    await thermalPrinterService.dispatchReceipt(81, 'ORDER_CREATED');

    const body = printJobService.createPrintJob.mock.calls[0][0].payload;
    expect(body.receipt.text).toContain('0.5 x $14.00 = $7.00');
  });

  it('surfaces print job creation failures so callers do not mistake them for queued work', async () => {
    mockPickupOrder();
    prismaMock.orderItem.findMany.mockResolvedValue([
      { id: 1, orderId: 81, variantId: 2, productName: 'Blue Dream', variantLabel: 'Default', quantity: 2, unitPrice: D(10.82), voided: false, addedAfterSubmission: false, variant: { product: { category: { name: 'Flower' } } } },
    ]);

    printJobService.createPrintJob.mockRejectedValue(new Error('database unavailable'));

    const { thermalPrinterService } = await import('./thermalPrinter.service');

    await expect(thermalPrinterService.dispatchReceipt(81, 'ORDER_CREATED')).rejects.toThrow('database unavailable');
  });

  it('uses fallback text when product or category details are missing', async () => {
    mockPickupOrder();
    prismaMock.orderItem.findMany.mockResolvedValue([
      { id: 11, orderId: 81, variantId: 99, productName: 'Product #99', variantLabel: 'Default', quantity: 1, unitPrice: D(8), voided: false, addedAfterSubmission: false, variant: { product: { category: null } } },
    ]);

    const { thermalPrinterService } = await import('./thermalPrinter.service');
    await thermalPrinterService.dispatchReceipt(81, 'ORDER_CREATED');

    const body = printJobService.createPrintJob.mock.calls[0][0].payload;
    expect(body.order.items[0]).toMatchObject({
      variantId: 99,
      productName: 'Product #99',
      categoryName: null,
    });
    expect(body.receipt.text).toContain('PRODUCT #99');
  });
});
