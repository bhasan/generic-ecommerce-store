import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError, errorHandler } from '../middleware/error.middleware';

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
    expect(orderService.getAllOrders).toHaveBeenCalledWith(10, ['CUSTOMER']);
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

  it('creates orders through the full checkout route stack', async () => {
    verifyToken.mockReturnValue({ userId: 10, username: 'customer-one', roles: ['CUSTOMER'] });
    orderService.createOrder.mockResolvedValue({ id: 900, total: 42.5, status: 'PENDING' });

    const payload = {
      items: [{ productId: 7, quantity: 2 }],
      cashAppUsername: '$customer-one',
      deliveryMethod: 'PICKUP',
      paymentMethod: 'EXTERNAL',
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
      deliveryMethod: 'PICKUP',
      paymentMethod: 'EXTERNAL',
    });
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
    expect(orderService.updateOrderStatus).toHaveBeenCalledWith(12, { status: 'DELIVERED' }, ['DELIVERY_DRIVER']);
  });

  it('enforces employee-or-higher access for order item mutations', async () => {
    verifyToken.mockReturnValue({ userId: 10, username: 'customer-one', roles: ['CUSTOMER'] });

    const { response, body } = await requestJson(server, '/api/orders/12/items', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer customer-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ productId: 7, quantity: 1 }),
    });

    expect(response.status).toBe(403);
    expect(body).toEqual({
      error: 'Access denied. Insufficient permissions.',
      required: ['EMPLOYEE', 'MANAGEMENT', 'ADMIN'],
      current: ['CUSTOMER'],
    });
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
});
