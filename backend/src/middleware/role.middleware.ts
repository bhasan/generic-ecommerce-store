import { Request, Response, NextFunction } from 'express';
import { RoleName, hasAnyRole } from '../constants/roles';

/**
 * Middleware to check if user has required role(s)
 * Must be used after authenticate middleware
 */
export const authorize = (...allowedRoles: RoleName[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!hasAnyRole(req.user.roles, allowedRoles)) {
      res.status(403).json({ 
        error: 'Access denied. Insufficient permissions.',
        required: allowedRoles,
        current: req.user.roles
      });
      return;
    }

    next();
  };
};

/**
 * Check if user is CUSTOMER or higher
 */
export const authorizeCustomer = authorize('CUSTOMER', 'EMPLOYEE', 'MANAGEMENT', 'ADMIN');

/**
 * Check if user is EMPLOYEE or higher (can manage orders)
 */
export const authorizeEmployee = authorize('EMPLOYEE', 'MANAGEMENT', 'ADMIN');

/**
 * Check if user is MANAGEMENT or ADMIN
 */
export const authorizeManagement = authorize('MANAGEMENT', 'ADMIN');

/**
 * Check if user is ADMIN only
 */
export const authorizeAdmin = authorize('ADMIN');
