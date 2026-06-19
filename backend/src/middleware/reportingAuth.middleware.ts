import { randomUUID, timingSafeEqual } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { logger } from '../utils/logger';
import { buildReportingError } from '../utils/reportingEnvelope';
import { getReportingConfig } from '../utils/reportingConfig';

const getBearerToken = (authorizationHeader: string | undefined): string | null => {
  if (!authorizationHeader?.startsWith('Bearer ')) return null;
  return authorizationHeader.slice('Bearer '.length);
};

const constantTimeEquals = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
};

export const assignReportingRequestId = (req: Request, res: Response, next: NextFunction): void => {
  const headerRequestId = req.get('x-request-id')?.trim();
  const requestId = headerRequestId || req.requestId || `req_${randomUUID()}`;
  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);
  next();
};

export const requireReportingEnabled = (req: Request, res: Response, next: NextFunction): void => {
  const config = getReportingConfig();
  if (!config.enabled) {
    logger.warn('Online store reporting API request rejected because API is disabled', {
      requestId: req.requestId || 'unknown',
      method: req.method,
      path: req.originalUrl,
    });
    res.status(503).json(buildReportingError(req, 'Online store reporting API is disabled', 'REPORTING_API_DISABLED'));
    return;
  }
  next();
};

export const requireReportingAuth = (req: Request, res: Response, next: NextFunction): void => {
  const config = getReportingConfig();
  const expectedToken = config.token;
  const suppliedToken = getBearerToken(req.get('authorization'));

  if (!expectedToken || !suppliedToken || !constantTimeEquals(suppliedToken, expectedToken)) {
    logger.warn('Online store reporting API authentication failed', {
      requestId: req.requestId || 'unknown',
      method: req.method,
      path: req.originalUrl,
      hasAuthorizationHeader: Boolean(req.get('authorization')),
    });
    res.status(401).json(buildReportingError(req, 'Unauthorized', 'UNAUTHORIZED'));
    return;
  }

  next();
};

export const reportingRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: () => getReportingConfig().rateLimitPerMinute,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Online store reporting API rate limit exceeded', {
      requestId: req.requestId || 'unknown',
      method: req.method,
      path: req.originalUrl,
      ip: req.ip || req.socket.remoteAddress,
    });
    res.status(429).json(buildReportingError(req, 'Rate limit exceeded', 'RATE_LIMITED'));
  },
});
