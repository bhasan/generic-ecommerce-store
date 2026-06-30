import { Request, Response, NextFunction } from 'express';
import { RoleName } from '../constants/roles';
import { logger } from '../utils/logger';

/**
 * Middleware to check if user has required role(s)
 * Must be used after authenticate middleware
 */
export const authorize = (...allowedRoles: RoleName[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      // Preserve the existing 401/403 behavior; this log exists so permission
      // failures can be traced without reproducing them interactively.
      logger.warn('Authorization failed: missing authenticated user', {
        requestId: req.requestId || 'unknown',
        path: req.path,
        method: req.method,
        requiredRoles: allowedRoles,
      });
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const roles = req.user.roles ?? [];
    const actingStore = req.store?.id ?? null;

    const hasMatch = roles.some((r: any) => {
      const roleName = typeof r === 'string' ? r : r.name;
      const storeId = typeof r === 'string' ? null : r.storeId;

      const isAllowed = allowedRoles.includes(roleName as RoleName) || roleName === 'SUPER_ADMIN';
      const isStoreMatched = storeId === null || storeId === actingStore || roleName === 'SUPER_ADMIN';

      return isAllowed && isStoreMatched;
    });

    if (!hasMatch) {
      // Required/current role snapshots are intentionally included here because
      // frontend redirects can otherwise hide why access was denied.
      logger.warn('Authorization failed: insufficient permissions', {
        requestId: req.requestId || 'unknown',
        path: req.path,
        method: req.method,
        userId: req.user.userId,
        currentRoles: req.user.roles,
        requiredRoles: allowedRoles,
      });
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

/**
 * SUPER_ADMIN gate for platform-wide (cross-tenant) management endpoints, e.g.
 * tenant provisioning. Tenant management is a PLATFORM function — managing every
 * business on the shared instance — so it must be restricted to the SUPER_ADMIN
 * role. A regular per-tenant ADMIN (including the default 'app' tenant's admin) is
 * NOT a super-admin and is rejected with 403. (This will move behind a dedicated
 * super-admin portal later; for now the screen lives in website-management but is
 * only visible/usable to a SUPER_ADMIN.)
 */
export const requireSuperAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const roles = (req.user.roles ?? []) as Array<string | { name: string }>;
  const roleNames = roles.map((r) => (typeof r === 'string' ? r : r.name));

  if (!roleNames.includes('SUPER_ADMIN')) {
    logger.warn('Super-admin access denied', {
      requestId: req.requestId || 'unknown',
      path: req.path,
      method: req.method,
      userId: req.user.userId,
      tenantSlug: req.tenant?.slug ?? null,
      currentRoles: roleNames,
    });
    res.status(403).json({ error: 'Super administrator access required.' });
    return;
  }
  next();
};
