import { Request, Response, NextFunction } from 'express';
import { extractTokenFromHeader, verifyToken } from '../utils/jwt.util';
import { logger } from '../utils/logger';

/**
 * Middleware to verify JWT token and attach user info to request
 */
export const authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const token = extractTokenFromHeader(req.headers.authorization);

    if (!token) {
      // Keep this log additive-only: support/debugging needs the failure context,
      // but callers must still receive the same 401 payload as before.
      logger.warn('Authentication failed: missing bearer token', {
        requestId: req.requestId || 'unknown',
        path: req.path,
        method: req.method,
        hasAuthorizationHeader: Boolean(req.headers.authorization),
      });
      res.status(401).json({ error: 'No token provided. Authentication required.' });
      return;
    }

    const decoded = verifyToken(token);
    // Successful auth logs are the backend anchor for correlating frontend requestId
    // failures with the user/role context that reached the route.
    logger.info('Authentication succeeded', {
      requestId: req.requestId || 'unknown',
      path: req.path,
      method: req.method,
      userId: decoded.userId,
      roles: decoded.roles,
    });
    req.user = decoded;
    next();
  } catch (error) {
    logger.warn('Authentication failed: invalid or expired token', {
      requestId: req.requestId || 'unknown',
      path: req.path,
      method: req.method,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }
};

/**
 * Optional authentication - doesn't fail if no token provided
 * Useful for routes that work differently for authenticated vs non-authenticated users
 */
export const optionalAuthenticate = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  try {
    const token = extractTokenFromHeader(req.headers.authorization);

    if (token) {
      const decoded = verifyToken(token);
      logger.debug('Optional authentication succeeded', {
        requestId: req.requestId || 'unknown',
        path: req.path,
        method: req.method,
        userId: decoded.userId,
        roles: decoded.roles,
      });
      req.user = decoded;
    }
    next();
  } catch (error) {
    // Optional auth must never change route behavior; we only record the invalid
    // token so later debugging can explain why req.user was absent downstream.
    logger.warn('Optional authentication ignored invalid token', {
      requestId: req.requestId || 'unknown',
      path: req.path,
      method: req.method,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    next();
  }
};
