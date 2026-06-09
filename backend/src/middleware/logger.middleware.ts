import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { logger } from '../utils/logger';

const requestIpDebugSampleSize = Number.parseInt(process.env.REQUEST_IP_DEBUG_SAMPLE_SIZE || '5', 10);
let remainingRequestIpSamples = Number.isFinite(requestIpDebugSampleSize) && requestIpDebugSampleSize > 0
  ? requestIpDebugSampleSize
  : 0;

/**
 * Request logging middleware
 * Logs all API requests with method, path, user info, and response details
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = Date.now();
  const requestId = `req_${randomUUID()}`;
  
  // Store request ID for use in response logging
  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);

  if (remainingRequestIpSamples > 0) {
    remainingRequestIpSamples -= 1;
    logger.debug('Request IP resolution sample', {
      requestId,
      method: req.method,
      path: req.path,
      ip: req.ip || req.socket.remoteAddress,
      ips: req.ips || [],
      socketRemoteAddress: req.socket.remoteAddress,
      cfConnectingIp: req.get('cf-connecting-ip'),
      xForwardedFor: req.get('x-forwarded-for'),
      xRealIp: req.get('x-real-ip'),
      trustProxy: req.app.get('trust proxy'),
    });
  }

  // Log incoming request
  logger.info('API Request', {
    requestId,
    method: req.method,
    path: req.path,
    query: req.query,
    userId: req.user?.userId || 'anonymous',
    userRoles: req.user?.roles || [],
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
      userId: req.user?.userId || 'anonymous',
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

