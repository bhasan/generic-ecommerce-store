import { Request, Response, NextFunction } from 'express';
import { Role } from '../generated/prisma';

/**
 * Middleware to check if user has required role(s)
 * Must be used after authenticate middleware
 */
export const authorize = (...allowedRoles: Role[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ 
        error: 'Access denied. Insufficient permissions.',
        required: allowedRoles,
        current: req.user.role
      });
      return;
    }

    next();
  };
};

/**
 * Check if user is CUSTOMER or higher
 */
export const authorizeCustomer = authorize(Role.CUSTOMER, Role.MANAGEMENT, Role.ADMIN);

/**
 * Check if user is MANAGEMENT or ADMIN
 */
export const authorizeManagement = authorize(Role.MANAGEMENT, Role.ADMIN);

/**
 * Check if user is ADMIN only
 */
export const authorizeAdmin = authorize(Role.ADMIN);
