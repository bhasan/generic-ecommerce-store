import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../middleware/error.middleware';

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
const notificationService = vi.hoisted(() => ({
  getStaffNotificationCounts: vi.fn(),
  listForUser: vi.fn(),
  getUnreadCount: vi.fn(),
  markAsRead: vi.fn(),
  markAllAsRead: vi.fn(),
}));

vi.mock('../utils/jwt.util', () => ({
  verifyToken,
  extractTokenFromHeader,
}));

vi.mock('../utils/logger', () => ({
  logger,
}));

vi.mock('../services/notification.service', () => ({
  notificationService,
}));

const createServer = async () => {
  const { default: notificationRoutes } = await import('../routes/notification.routes');

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.requestId = 'req-notifications';
    next();
  });
  app.use('/api/notifications', notificationRoutes);
  app.use(errorHandler);
  return app.listen(0);
};

const requestJson = async (server: ReturnType<typeof express.application.listen>, path: string, init?: RequestInit) => {
  const { port } = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${port}${path}`, init);
  const body = await response.json();
  return { response, body };
};

describe('notification routes integration', () => {
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

  it('lists notifications for the authenticated user', async () => {
    verifyToken.mockReturnValue({ userId: 7, username: 'staff-one', roles: ['MANAGEMENT'] });
    notificationService.listForUser.mockResolvedValue([{ id: 101, title: 'New order' }]);

    const { response, body } = await requestJson(server, '/api/notifications', {
      headers: { Authorization: 'Bearer token' },
    });

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, data: [{ id: 101, title: 'New order' }] });
    expect(notificationService.listForUser).toHaveBeenCalledWith(7, { unreadOnly: false });
  });

  it('returns unread counts for the authenticated user', async () => {
    verifyToken.mockReturnValue({ userId: 9, username: 'customer-one', roles: ['CUSTOMER'] });
    notificationService.getUnreadCount.mockResolvedValue({ count: 3 });

    const { response, body } = await requestJson(server, '/api/notifications/unread-count', {
      headers: { Authorization: 'Bearer token' },
    });

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, data: { count: 3 } });
    expect(notificationService.getUnreadCount).toHaveBeenCalledWith(9);
  });

  it('marks a notification as read for the authenticated user', async () => {
    verifyToken.mockReturnValue({ userId: 9, username: 'customer-one', roles: ['CUSTOMER'] });
    notificationService.markAsRead.mockResolvedValue({ updated: true });

    const { response, body } = await requestJson(server, '/api/notifications/44/read', {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, data: { updated: true } });
    expect(notificationService.markAsRead).toHaveBeenCalledWith(44, 9);
  });

  it('marks all notifications as read for the authenticated user', async () => {
    verifyToken.mockReturnValue({ userId: 9, username: 'customer-one', roles: ['CUSTOMER'] });
    notificationService.markAllAsRead.mockResolvedValue({ updated: 4 });

    const { response, body } = await requestJson(server, '/api/notifications/read-all', {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, data: { updated: 4 } });
    expect(notificationService.markAllAsRead).toHaveBeenCalledWith(9);
  });
});
