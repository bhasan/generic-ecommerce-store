import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * Request logging middleware
 * Logs all API requests with method, path, user info, and response details
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = Date.now();
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Store request ID for use in response logging
  (req as any).requestId = requestId;

  // Log incoming request
  logger.info('API Request', {
    requestId,
    method: req.method,
    path: req.path,
    query: req.query,
    userId: (req as any).user?.userId || 'anonymous',
    userRoles: (req as any).user?.roles || [],
    ip: req.ip || req.socket.remoteAddress,
    userAgent: req.get('user-agent'),
    ...(req.method !== 'GET' && req.body && {
      body: sanitizeRequestBody(req.body),
    }),
  });

  // Capture response details
  const originalSend = res.send;
  res.send = function (body) {
    const duration = Date.now() - startTime;
    
    logger.info('API Response', {
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userId: (req as any).user?.userId || 'anonymous',
      ...(res.statusCode >= 400 && {
        errorBody: typeof body === 'string' ? body.substring(0, 500) : body,
      }),
    });

    return originalSend.call(this, body);
  };

  next();
};

/**
 * Sanitize request body to remove sensitive information before logging
 */
function sanitizeRequestBody(body: any): any {
  if (!body || typeof body !== 'object') {
    return body;
  }

  const sensitiveFields = ['password', 'token', 'authToken', 'authorization'];
  const sanitized = { ...body };

  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  }

  return sanitized;
}

