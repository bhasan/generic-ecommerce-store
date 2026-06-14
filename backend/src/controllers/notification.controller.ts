import { Request, Response } from 'express';
import { notificationService } from '../services/notification.service';
import { parseIntParam } from '../utils/request.util';

export const getStaffNotificationCounts = async (
  _req: Request,
  res: Response
): Promise<void> => {
  const counts = await notificationService.getStaffNotificationCounts();
  res.json(counts);
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
  res.json(notifications);
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
  res.json(count);
};

export const markNotificationRead = async (
  req: Request,
  res: Response
): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const notificationId = parseIntParam(req.params.id, res, 'notification');
  if (notificationId === null) return;
  const result = await notificationService.markAsRead(notificationId, req.user.userId);
  res.json(result);
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
  res.json(result);
};
