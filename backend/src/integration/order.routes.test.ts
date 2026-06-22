import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError, errorHandler } from '../middleware/error.middleware';
import { DeliveryMethod, PaymentMethod } from '../constants/orderMethods';

const verifyToken = vi.hoisted(() => vi.fn());
const extractTokenFromHeader = vi.hoisted(() => vi.fn((header?: string) => {
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length);
}));
const logger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  logEvent: vi.fn(),
}));
const orderService = vi.hoisted(() => ({
  getAllOrders: vi.fn(),
  getReadyForDeliveryOrders: vi.fn(),
  getOutForDeliveryOrders: vi.fn(),
  getDeliveredOrders: vi.fn(),
  getOrderById: vi.fn(),
  createOrder: vi.fn(),
  updateOrderStatus: vi.fn(),
  addItemToOrder: vi.fn(),
  voidOrderItem: vi.fn(),
  deleteOrderItem: vi.fn(),
  deleteOrder: vi.fn(),
  printOrderReceipt: vi.fn(),
  customerArrive: vi.fn(),
  getPaymentToken: vi.fn(),
  confirmCardPayment: vi.fn(),
}));
const deliveryEligibilityService = vi.hoisted(() => ({
  checkDeliveryEligibility: vi.fn(),
}));

vi.mock('../utils/jwt.util', () => ({
  verifyToken,
  extractTokenFromHeader,
}));

vi.mock('../utils/logger', () => ({
  logger,
}));

vi.mock('../services/order.service', () => ({
  default: orderService,
}));

vi.mock('../services/deliveryEligibility.service', () => ({
  DeliveryEligibilityService: vi.fn(() => deliveryEligibilityService),
}));

const createServer = async () => {
  const { default: orderRoutes } = await import('../routes/order.routes');

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.requestId = 'req-orders';
    next();
  });
  app.use('/api/orders', orderRoutes);
  app.use(errorHandler);
  return app.listen(0);
};

const requestJson = async (server: ReturnType<typeof express.application.listen>, path: string, init?: RequestInit) => {
  const { port } = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${port}${path}`, init);
  const body = await response.json();
  return { response, body };
};

describe('order routes integration', () => {
  let server: Awaited<ReturnType<typeof createServer>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    server = await createServer();
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  });

  it('returns user-scoped orders for authenticated customers', async () => {
    verifyToken.mockReturnValue({ userId: 10, username: 'customer-one', roles: ['CUSTOMER'] });
    orderService.getAllOrders.mockResolvedValue([{ id: 501, total: 22 }]);

    const { response, body } = await requestJson(server, '/api/orders', {
      headers: { Authorization: 'Bearer customer-token' },
    });

    expect(response.status).toBe(200);
    expect(body).toEqual([{ id: 501, total: 22 }]);
    expect(orderService.getAllOrders).toHaveBeenCalledWith(10, ['CUSTOMER'], undefined, undefined);
  });

  it('forwards limit and offset query params to the order service', async () => {
    verifyToken.mockReturnValue({ userId: 10, username: 'admin', roles: ['ADMIN'] });
    orderService.getAllOrders.mockResolvedValue([]);

    const { response } = await requestJson(server, '/api/orders?limit=50&offset=100', {
      headers: { Authorization: 'Bearer admin-token' },
    });

    expect(response.status).toBe(200);
    expect(orderService.getAllOrders).toHaveBeenCalledWith(10, ['ADMIN'], 50, 100);
  });

  it('rejects invalid checkout payloads before hitting order creation', async () => {
    verifyToken.mockReturnValue({ userId: 10, username: 'customer-one', roles: ['CUSTOMER'] });

    const { response, body } = await requestJson(server, '/api/orders', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer customer-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ items: [] }),
    });

    expect(response.status).toBe(400);
    expect(body.errors[0].msg).toBe('Order must contain at least one item');
    expect(orderService.createOrder).not.toHaveBeenCalled();
  });

  it('requires an explicit delivery method for checkout', async () => {
    verifyToken.mockReturnValue({ userId: 10, username: 'customer-one', roles: ['CUSTOMER'] });

    const { response, body } = await requestJson(server, '/api/orders', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer customer-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items: [{ variantId: 7, quantity: 1 }],
      }),
    });

    expect(response.status).toBe(400);
    expect(body.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ msg: 'Delivery method must be DELIVERY or PICKUP' }),
    ]));
    expect(orderService.createOrder).not.toHaveBeenCalled();
  });

  it('creates orders through the full checkout route stack', async () => {
    verifyToken.mockReturnValue({ userId: 10, username: 'customer-one', roles: ['CUSTOMER'] });
    orderService.createOrder.mockResolvedValue({ id: 900, total: 42.5, status: 'PENDING' });

    const payload = {
      items: [{ variantId: 7, quantity: 2 }],
      cashAppUsername: '$customer-one',
      deliveryMethod: DeliveryMethod.PICKUP,
      paymentMethod: PaymentMethod.EXTERNAL,
    };

    const { response, body } = await requestJson(server, '/api/orders', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer customer-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    expect(response.status).toBe(201);
    expect(body).toEqual({
      message: 'Order created successfully',
      order: { id: 900, total: 42.5, status: 'PENDING' },
    });
    expect(orderService.createOrder).toHaveBeenCalledWith({
      userId: 10,
      items: payload.items,
      cashAppUsername: '$customer-one',
      deliveryMethod: DeliveryMethod.PICKUP,
      paymentMethod: PaymentMethod.EXTERNAL,
      deliveryAddress: undefined,
    });
  });

  it('validates the delivery eligibility endpoint and returns the service response', async () => {
    verifyToken.mockReturnValue({ userId: 10, username: 'customer-one', roles: ['CUSTOMER'] });
    deliveryEligibilityService.checkDeliveryEligibility.mockResolvedValue({
      deliverable: true,
      deliveryStatus: 'IN_ZONE',
      deliverySource: 'ZIP_FALLBACK',
      distanceMiles: null,
      thresholdMiles: 5,
      message: 'Delivery verified by ZIP fallback while Google address verification is temporarily unavailable.',
    });

    const payload = {
      deliveryAddress: {
        street: '123 Main St',
        city: 'Houston',
        state: 'TX',
        zipCode: '77083',
      },
    };

    const { response, body } = await requestJson(server, '/api/orders/delivery-eligibility', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer customer-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    expect(response.status).toBe(200);
    expect(body).toEqual({
      deliverable: true,
      deliveryStatus: 'IN_ZONE',
      deliverySource: 'ZIP_FALLBACK',
      distanceMiles: null,
      thresholdMiles: 5,
      message: 'Delivery verified by ZIP fallback while Google address verification is temporarily unavailable.',
    });
    expect(deliveryEligibilityService.checkDeliveryEligibility).toHaveBeenCalledWith(payload.deliveryAddress);
  });

  it('blocks delivery drivers from setting disallowed order statuses', async () => {
    verifyToken.mockReturnValue({ userId: 22, username: 'driver-one', roles: ['DELIVERY_DRIVER'] });

    const { response, body } = await requestJson(server, '/api/orders/12/status', {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer driver-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'READY_FOR_DELIVERY' }),
    });

    expect(response.status).toBe(403);
    expect(body).toEqual({ error: 'Delivery drivers can only mark orders as DELIVERED' });
    expect(orderService.updateOrderStatus).not.toHaveBeenCalled();
  });

  it('allows delivery drivers to mark orders as delivered', async () => {
    verifyToken.mockReturnValue({ userId: 22, username: 'driver-one', roles: ['DELIVERY_DRIVER'] });
    orderService.updateOrderStatus.mockResolvedValue({ id: 12, status: 'DELIVERED' });

    const { response, body } = await requestJson(server, '/api/orders/12/status', {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer driver-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'DELIVERED' }),
    });

    expect(response.status).toBe(200);
    expect(body).toEqual({
      message: 'Order status updated successfully',
      order: { id: 12, status: 'DELIVERED' },
    });
    expect(orderService.updateOrderStatus).toHaveBeenCalledWith(12, { status: 'DELIVERED', changedBy: 22 }, ['DELIVERY_DRIVER']);
  });

  it('enforces employee-or-higher access for order item mutations', async () => {
    verifyToken.mockReturnValue({ userId: 10, username: 'customer-one', roles: ['CUSTOMER'] });

    const { response, body } = await requestJson(server, '/api/orders/12/items', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer customer-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ variantId: 7, quantity: 1 }),
    });

    expect(response.status).toBe(403);
    expect(body).toEqual({
      error: 'Access denied. Insufficient permissions.',
      required: ['EMPLOYEE', 'MANAGEMENT', 'ADMIN'],
      current: ['CUSTOMER'],
    });
  });

  it('queues a manual reprint for staff users', async () => {
    verifyToken.mockReturnValue({ userId: 2, username: 'employee-one', roles: ['EMPLOYEE'] });
    orderService.printOrderReceipt.mockResolvedValue({
      queued: true,
      reason: 'MANUAL_REPRINT',
      orderId: 44,
    });

    const { response, body } = await requestJson(server, '/api/orders/44/print', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer employee-token',
      },
    });

    expect(response.status).toBe(202);
    expect(body).toEqual({
      message: 'Order receipt queued for printing',
      result: {
        queued: true,
        reason: 'MANUAL_REPRINT',
        orderId: 44,
      },
    });
    expect(orderService.printOrderReceipt).toHaveBeenCalledWith(44, {
      actor: {
        userId: 2,
        username: 'employee-one',
      },
    });
  });

  it('blocks customers from the manual reprint endpoint', async () => {
    verifyToken.mockReturnValue({ userId: 10, username: 'customer-one', roles: ['CUSTOMER'] });

    const { response, body } = await requestJson(server, '/api/orders/44/print', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer customer-token',
      },
    });

    expect(response.status).toBe(403);
    expect(body).toEqual({
      error: 'Access denied. Insufficient permissions.',
      required: ['EMPLOYEE', 'MANAGEMENT', 'ADMIN'],
      current: ['CUSTOMER'],
    });
    expect(orderService.printOrderReceipt).not.toHaveBeenCalled();
  });

  it('returns a not-configured message when the printer queue is skipped', async () => {
    verifyToken.mockReturnValue({ userId: 2, username: 'employee-one', roles: ['EMPLOYEE'] });
    orderService.printOrderReceipt.mockResolvedValue({
      queued: false,
      reason: 'MANUAL_REPRINT',
      orderId: 44,
    });

    const { response, body } = await requestJson(server, '/api/orders/44/print', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer employee-token',
      },
    });

    expect(response.status).toBe(202);
    expect(body).toEqual({
      message: 'Printer is not configured; receipt was not queued',
      result: {
        queued: false,
        reason: 'MANUAL_REPRINT',
        orderId: 44,
      },
    });
  });

  it('accepts IN_STORE payment method with PICKUP delivery', async () => {
    verifyToken.mockReturnValue({ userId: 10, username: 'customer-one', roles: ['CUSTOMER'] });
    orderService.createOrder.mockResolvedValue({ id: 901, total: 10.83, status: 'PENDING' });

    const payload = {
      items: [{ variantId: 3, quantity: 1 }],
      deliveryMethod: DeliveryMethod.PICKUP,
      paymentMethod: PaymentMethod.IN_STORE,
    };

    const { response, body } = await requestJson(server, '/api/orders', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer customer-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    expect(response.status).toBe(201);
    expect(body).toEqual({
      message: 'Order created successfully',
      order: { id: 901, total: 10.83, status: 'PENDING' },
    });
    expect(orderService.createOrder).toHaveBeenCalledWith({
      userId: 10,
      items: payload.items,
      cashAppUsername: undefined,
      deliveryMethod: DeliveryMethod.PICKUP,
      paymentMethod: PaymentMethod.IN_STORE,
    });
  });

  it('rejects unknown payment method values before hitting order creation', async () => {
    verifyToken.mockReturnValue({ userId: 10, username: 'customer-one', roles: ['CUSTOMER'] });

    const { response, body } = await requestJson(server, '/api/orders', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer customer-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items: [{ variantId: 1, quantity: 1 }],
        paymentMethod: 'CASH',
      }),
    });

    expect(response.status).toBe(400);
    expect(body.errors[0].msg).toBe('Payment method must be EXTERNAL, STORE_CREDIT, or IN_STORE');
    expect(orderService.createOrder).not.toHaveBeenCalled();
  });

  it('surfaces service errors for admin-only order deletion', async () => {
    verifyToken.mockReturnValue({ userId: 1, username: 'admin-one', roles: ['ADMIN'] });
    orderService.deleteOrder.mockRejectedValue(new AppError('Order not found', 404, 'INTERNAL_ERROR'));

    const { response, body } = await requestJson(server, '/api/orders/999', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer admin-token' },
    });

    expect(response.status).toBe(404);
    expect(body).toEqual({
      error: {
        message: 'Order not found',
        code: 'INTERNAL_ERROR',
        requestId: 'req-orders',
      },
    });
  });

  describe('POST /api/orders/:id/arrive', () => {
    it('successfully updates order status to ARRIVED and forwards parameters', async () => {
      verifyToken.mockReturnValue({ userId: 10, username: 'customer-one', roles: ['CUSTOMER'] });
      orderService.customerArrive.mockResolvedValue({
        id: 701,
        status: 'ARRIVED',
        deliveryMethod: 'CURBSIDE',
        deliveryAddress: 'CURBSIDE: Blue Civic | SPOT: Space 3',
      });

      const { response, body } = await requestJson(server, '/api/orders/701/arrive', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer customer-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ parkingSpot: 'Space 3' }),
      });

      expect(response.status).toBe(200);
      expect(body).toEqual({
        message: 'Arrival notification sent successfully',
        order: {
          id: 701,
          status: 'ARRIVED',
          deliveryMethod: 'CURBSIDE',
          deliveryAddress: 'CURBSIDE: Blue Civic | SPOT: Space 3',
        },
      });
      expect(orderService.customerArrive).toHaveBeenCalledWith(701, 10, 'Space 3');
    });

    it('rejects validation check when parkingSpot is missing', async () => {
      verifyToken.mockReturnValue({ userId: 10, username: 'customer-one', roles: ['CUSTOMER'] });

      const { response, body } = await requestJson(server, '/api/orders/701/arrive', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer customer-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
      expect(body.errors[0].msg).toBe('Parking spot details are required');
      expect(orderService.customerArrive).not.toHaveBeenCalled();
    });
  });

  describe('POST /:id/payment/token', () => {
    it('returns 401 without an auth token', async () => {
      const { response } = await requestJson(server, '/api/orders/42/payment/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(response.status).toBe(401);
      expect(orderService.getPaymentToken).not.toHaveBeenCalled();
    });

    it('returns token and iframeUrl for the order owner', async () => {
      verifyToken.mockReturnValue({ userId: 7, username: 'customer-one', roles: ['CUSTOMER'] });
      orderService.getPaymentToken.mockResolvedValue({
        token: 'tok_sandbox',
        iframeUrl: 'https://test.authorize.net/payment/payment?token=tok_sandbox',
      });

      const { response, body } = await requestJson(server, '/api/orders/42/payment/token', {
        method: 'POST',
        headers: { Authorization: 'Bearer customer-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(200);
      expect(body).toEqual({
        token: 'tok_sandbox',
        iframeUrl: 'https://test.authorize.net/payment/payment?token=tok_sandbox',
      });
      expect(orderService.getPaymentToken).toHaveBeenCalledWith(42, 7);
    });

    it('forwards a 404 when the service throws order-not-found', async () => {
      verifyToken.mockReturnValue({ userId: 7, username: 'customer-one', roles: ['CUSTOMER'] });
      orderService.getPaymentToken.mockRejectedValue(new AppError('Order not found', 404));

      const { response, body } = await requestJson(server, '/api/orders/99/payment/token', {
        method: 'POST',
        headers: { Authorization: 'Bearer customer-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(404);
      expect(body.error.message).toBe('Order not found');
    });
  });

  describe('POST /:id/payment/verify', () => {
    it('returns 401 without an auth token', async () => {
      const { response } = await requestJson(server, '/api/orders/42/payment/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transId: 'txn_abc' }),
      });
      expect(response.status).toBe(401);
      expect(orderService.confirmCardPayment).not.toHaveBeenCalled();
    });

    it('confirms a card payment and returns the updated order', async () => {
      verifyToken.mockReturnValue({ userId: 7, username: 'customer-one', roles: ['CUSTOMER'] });
      orderService.confirmCardPayment.mockResolvedValue({ id: 42, status: 'PENDING' });

      const { response, body } = await requestJson(server, '/api/orders/42/payment/verify', {
        method: 'POST',
        headers: { Authorization: 'Bearer customer-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ transId: 'txn_abc' }),
      });

      expect(response.status).toBe(200);
      expect(body).toEqual({ message: 'Payment confirmed', order: { id: 42, status: 'PENDING' } });
      expect(orderService.confirmCardPayment).toHaveBeenCalledWith(42, 7, 'txn_abc');
    });

    it('forwards a 400 when the transactionId is a replay', async () => {
      verifyToken.mockReturnValue({ userId: 7, username: 'customer-one', roles: ['CUSTOMER'] });
      orderService.confirmCardPayment.mockRejectedValue(
        new AppError('This payment has already been applied to another order', 400)
      );

      const { response, body } = await requestJson(server, '/api/orders/42/payment/verify', {
        method: 'POST',
        headers: { Authorization: 'Bearer customer-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ transId: 'txn_dup' }),
      });

      expect(response.status).toBe(400);
      expect(body.error.message).toBe('This payment has already been applied to another order');
    });
  });

  describe('Phase 3 — payments[] and statusEvents[] forwarded in responses', () => {
    it('createOrder response includes payments[] and statusEvents[] returned by the service', async () => {
      verifyToken.mockReturnValue({ userId: 10, username: 'customer-one', roles: ['CUSTOMER'] });
      orderService.createOrder.mockResolvedValue({
        id: 950,
        total: 64.93,
        status: 'PENDING',
        paymentMethod: 'EXTERNAL',
        payments: [
          { id: 1, method: 'EXTERNAL', status: 'PENDING', amount: 64.93, transactionId: null, paymentHandle: '$my-handle', createdAt: '2026-01-01T00:00:00.000Z' },
        ],
        statusEvents: [],
      });

      const { response, body } = await requestJson(server, '/api/orders', {
        method: 'POST',
        headers: { Authorization: 'Bearer customer-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{ variantId: 5, quantity: 2 }],
          deliveryMethod: DeliveryMethod.PICKUP,
          paymentMethod: PaymentMethod.EXTERNAL,
          cashAppUsername: '$my-handle',
        }),
      });

      expect(response.status).toBe(201);
      expect(body.order.payments).toHaveLength(1);
      expect(body.order.payments[0]).toMatchObject({ method: 'EXTERNAL', status: 'PENDING', paymentHandle: '$my-handle' });
      expect(body.order.statusEvents).toEqual([]);
    });

    it('updateOrderStatus response includes settled payments[] and statusEvents[] after EXTERNAL APPROVED', async () => {
      verifyToken.mockReturnValue({ userId: 1, username: 'staff', roles: ['MANAGEMENT'] });
      orderService.updateOrderStatus.mockResolvedValue({
        id: 951,
        status: 'APPROVED',
        payments: [
          { id: 2, method: 'EXTERNAL', status: 'SETTLED', amount: 64.93, transactionId: null, paymentHandle: '$my-handle', createdAt: '2026-01-01T00:00:00.000Z' },
        ],
        statusEvents: [
          { id: 1, fromStatus: 'PENDING', toStatus: 'APPROVED', changedBy: 1, note: null, createdAt: '2026-01-01T00:01:00.000Z' },
        ],
      });

      const { response, body } = await requestJson(server, '/api/orders/951/status', {
        method: 'PATCH',
        headers: { Authorization: 'Bearer staff-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'APPROVED' }),
      });

      expect(response.status).toBe(200);
      expect(body.order.payments[0]).toMatchObject({ method: 'EXTERNAL', status: 'SETTLED' });
      expect(body.order.statusEvents).toHaveLength(1);
      expect(body.order.statusEvents[0]).toMatchObject({ fromStatus: 'PENDING', toStatus: 'APPROVED' });
    });

    it('updateOrderStatus forwards the note field to the service', async () => {
      verifyToken.mockReturnValue({ userId: 1, username: 'staff', roles: ['MANAGEMENT'] });
      orderService.updateOrderStatus.mockResolvedValue({ id: 952, status: 'READY_FOR_PICKUP', payments: [], statusEvents: [] });

      await requestJson(server, '/api/orders/952/status', {
        method: 'PATCH',
        headers: { Authorization: 'Bearer staff-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'READY_FOR_PICKUP', note: 'Ready at counter' }),
      });

      expect(orderService.updateOrderStatus).toHaveBeenCalledWith(
        952,
        expect.objectContaining({ status: 'READY_FOR_PICKUP', note: 'Ready at counter' }),
        expect.any(Array),
      );
    });

    it('rejects a note over 500 characters', async () => {
      verifyToken.mockReturnValue({ userId: 1, username: 'staff', roles: ['MANAGEMENT'] });

      const { response, body } = await requestJson(server, '/api/orders/953/status', {
        method: 'PATCH',
        headers: { Authorization: 'Bearer staff-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'APPROVED', note: 'x'.repeat(501) }),
      });

      expect(response.status).toBe(400);
      expect(body.errors[0].msg).toMatch(/500/);
      expect(orderService.updateOrderStatus).not.toHaveBeenCalled();
    });
  });
});
