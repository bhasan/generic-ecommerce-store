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
