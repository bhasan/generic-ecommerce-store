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
 * Platform (cross-tenant) administrator gate for tenant-management endpoints.
 *
 * Gating cross-tenant management behind the per-tenant ADMIN role would let ANY
 * tenant's admin manage EVERY tenant (cross-tenant privilege escalation). So this
 * allows only:
 *   - a true platform SUPER_ADMIN (tenantId = null), OR
 *   - TEMPORARY, until a dedicated super-admin portal is extracted: the DEFAULT
 *     ('app') tenant's ADMIN, who acts as the platform operator.
 * A regular tenant's ADMIN (req.tenant.slug !== 'app') is rejected with 403.
 */
export const requirePlatformAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const roles = (req.user.roles ?? []) as Array<string | { name: string }>;
  const roleNames = roles.map((r) => (typeof r === 'string' ? r : r.name));
  const isSuperAdmin = roleNames.includes('SUPER_ADMIN');
  const isDefaultTenantAdmin = req.tenant?.slug === 'app' && roleNames.includes('ADMIN');

  if (!isSuperAdmin && !isDefaultTenantAdmin) {
    logger.warn('Platform admin access denied', {
      requestId: req.requestId || 'unknown',
      path: req.path,
      method: req.method,
      userId: req.user.userId,
      tenantSlug: req.tenant?.slug ?? null,
      currentRoles: roleNames,
    });
    res.status(403).json({ error: 'Platform administrator access required.' });
    return;
  }
  next();
};
