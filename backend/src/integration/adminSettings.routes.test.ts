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

const orderingConstraintsService = vi.hoisted(() => ({
  getOrderingConstraints: vi.fn(),
  updateOrderingConstraints: vi.fn(),
}));
const paymentSettingsService = vi.hoisted(() => ({
  getPaymentSettings: vi.fn(),
  updatePaymentSettings: vi.fn(),
}));
const storeSettingsService = vi.hoisted(() => ({
  getStoreSettings: vi.fn(),
  updateStoreSettings: vi.fn(),
}));

vi.mock('../utils/jwt.util', () => ({
  verifyToken,
  extractTokenFromHeader,
}));

vi.mock('../utils/logger', () => ({
  logger,
}));

vi.mock('../services/orderingConstraints.service', () => ({
  OrderingConstraintsService: vi.fn(() => orderingConstraintsService),
}));

vi.mock('../services/paymentSettings.service', () => ({
  PaymentSettingsService: vi.fn(() => paymentSettingsService),
}));

vi.mock('../services/storeSettings.service', () => ({
  StoreSettingsService: vi.fn(() => storeSettingsService),
}));

const createServer = async () => {
  const { default: orderingConstraintsRoutes } = await import('../routes/orderingConstraints.routes');
  const { default: paymentSettingsRoutes } = await import('../routes/paymentSettings.routes');
  const { default: storeSettingsRoutes } = await import('../routes/storeSettings.routes');

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.requestId = 'req-integration';
    next();
  });
  app.use('/api/ordering-constraints', orderingConstraintsRoutes);
  app.use('/api/payment-settings', paymentSettingsRoutes);
  app.use('/api/store-settings', storeSettingsRoutes);
  app.use(errorHandler);
  return app.listen(0);
};

const requestJson = async (server: ReturnType<typeof express.application.listen>, path: string, init?: RequestInit) => {
  const { port } = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${port}${path}`, init);
  const body = await response.json();
  return { response, body };
};

describe('admin settings routes integration', () => {
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

  it('rejects unauthenticated admin settings requests', async () => {
    const { response, body } = await requestJson(server, '/api/payment-settings');

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: 'No token provided. Authentication required.' });
    expect(logger.warn).toHaveBeenCalledWith('Authentication failed: missing bearer token', expect.objectContaining({
      requestId: 'req-integration',
      path: '/',
      method: 'GET',
    }));
  });

  it('rejects authenticated non-admin users before reaching the controller', async () => {
    verifyToken.mockReturnValue({ userId: 7, username: 'manager-one', roles: ['MANAGEMENT'] });

    const { response, body } = await requestJson(server, '/api/store-settings', {
      headers: { Authorization: 'Bearer manager-token' },
    });

    expect(response.status).toBe(403);
    expect(body).toEqual({
      error: 'Access denied. Insufficient permissions.',
      required: ['ADMIN'],
      current: ['MANAGEMENT'],
    });
    expect(storeSettingsService.getStoreSettings).not.toHaveBeenCalled();
  });

  it('returns ordering constraints for admin users through the full middleware chain', async () => {
    verifyToken.mockReturnValue({ userId: 1, username: 'admin-one', roles: ['ADMIN'] });
    orderingConstraintsService.getOrderingConstraints.mockResolvedValue({
      minimumDeliveryOrder: 45,
      minimumDeliveryOrderEnabled: true,
    });

    const { response, body } = await requestJson(server, '/api/ordering-constraints', {
      headers: { Authorization: 'Bearer admin-token' },
    });

    expect(response.status).toBe(200);
    expect(body).toEqual({
      minimumDeliveryOrder: 45,
      minimumDeliveryOrderEnabled: true,
    });
    expect(logger.info).toHaveBeenCalledWith('Authentication succeeded', expect.objectContaining({
      requestId: 'req-integration',
      userId: 1,
      roles: ['ADMIN'],
    }));
  });

  it('updates payment settings for admin users and returns the controller response shape', async () => {
    verifyToken.mockReturnValue({ userId: 1, username: 'admin-one', roles: ['ADMIN'] });
    const payload = {
      cashapp: { enabled: true, handle: '$SmokeStationHQ' },
      zelle: { enabled: true, handle: 'billing@example.com' },
      venmo: { enabled: false, handle: '' },
    };
    paymentSettingsService.updatePaymentSettings.mockResolvedValue(payload);

    const { response, body } = await requestJson(server, '/api/payment-settings', {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer admin-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    expect(response.status).toBe(200);
    expect(body).toEqual({
      message: 'Payment settings updated successfully',
      settings: payload,
    });
    expect(paymentSettingsService.updatePaymentSettings).toHaveBeenCalledWith(payload);
  });

  it('surfaces controller/service validation failures through the global error handler', async () => {
    verifyToken.mockReturnValue({ userId: 1, username: 'admin-one', roles: ['ADMIN'] });
    storeSettingsService.updateStoreSettings.mockRejectedValue(new AppError('Invalid store settings', 400, 'INVALID_STORE_SETTINGS'));

    const { response, body } = await requestJson(server, '/api/store-settings', {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer admin-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: '', address: '', phoneNumber: '' }),
    });

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: {
        message: 'Invalid store settings',
        code: 'INVALID_STORE_SETTINGS',
        requestId: 'req-integration',
      },
    });
  });
});
