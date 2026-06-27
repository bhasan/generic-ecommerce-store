import { Request, Response } from 'express';
import { notificationService } from '../services/notification.service';
import { successResponse } from '../utils/responseEnvelope';

export const getStaffNotificationCounts = async (
  _req: Request,
  res: Response
): Promise<void> => {
  const counts = await notificationService.getStaffNotificationCounts();
  res.json(successResponse(counts));
};

export const listNotifications = async (
  req: Request,
  res: Response
): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const unreadOnly = req.query.unread === 'true';
  const notifications = await notificationService.listForUser(req.user.userId, { unreadOnly });
  res.json(successResponse(notifications));
};

export const getUnreadNotificationCount = async (
  req: Request,
  res: Response
): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const count = await notificationService.getUnreadCount(req.user.userId);
  res.json(successResponse(count));
};

export const markNotificationRead = async (
  req: Request,
  res: Response
): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const notificationId = parseInt(req.params.id, 10);
  const result = await notificationService.markAsRead(notificationId, req.user.userId);
  res.json(successResponse(result));
};

export const markAllNotificationsRead = async (
  req: Request,
  res: Response
): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const result = await notificationService.markAllAsRead(req.user.userId);
  res.json(successResponse(result));
};
