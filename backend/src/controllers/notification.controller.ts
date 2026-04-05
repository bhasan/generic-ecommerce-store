import { Request, Response, NextFunction } from 'express';
import { notificationService } from '../services/notification.service';
import { logger } from '../utils/logger';

export const getStaffNotificationCounts = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const counts = await notificationService.getStaffNotificationCounts();
    res.json(counts);
  } catch (error) {
    logger.error('Failed to get staff notification counts', error as Error);
    next(error);
  }
};

export const listNotifications = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const unreadOnly = req.query.unread === 'true';
    const notifications = await notificationService.listForUser(req.user.userId, { unreadOnly });
    res.json(notifications);
  } catch (error) {
    logger.error('Failed to list notifications', error as Error);
    next(error);
  }
};

export const getUnreadNotificationCount = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const count = await notificationService.getUnreadCount(req.user.userId);
    res.json(count);
  } catch (error) {
    logger.error('Failed to get unread notification count', error as Error);
    next(error);
  }
};

export const markNotificationRead = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const notificationId = parseInt(req.params.id, 10);
    if (Number.isNaN(notificationId)) {
      res.status(400).json({ error: 'Invalid notification ID' });
      return;
    }

    const result = await notificationService.markAsRead(notificationId, req.user.userId);
    res.json(result);
  } catch (error) {
    logger.error('Failed to mark notification as read', error as Error);
    next(error);
  }
};

export const markAllNotificationsRead = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const result = await notificationService.markAllAsRead(req.user.userId);
    res.json(result);
  } catch (error) {
    logger.error('Failed to mark all notifications as read', error as Error);
    next(error);
  }
};
