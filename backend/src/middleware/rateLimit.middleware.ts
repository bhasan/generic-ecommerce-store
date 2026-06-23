import type { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { logger } from '../utils/logger';
import { parsePositiveInt } from '../utils/request.util';

type LimiterName = 'auth' | 'general' | 'polling';

const DEFAULT_WINDOW_MS = 15 * 60 * 1000;

const authRateLimitMax = parsePositiveInt(process.env.AUTH_RATE_LIMIT_MAX, 20);
const authRateLimitWindowMs = parsePositiveInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS, DEFAULT_WINDOW_MS);
const generalRateLimitMax = parsePositiveInt(process.env.GENERAL_RATE_LIMIT_MAX, 100);
const generalRateLimitWindowMs = parsePositiveInt(process.env.GENERAL_RATE_LIMIT_WINDOW_MS, DEFAULT_WINDOW_MS);
const pollRateLimitMax = parsePositiveInt(process.env.POLL_RATE_LIMIT_MAX, 240);
const pollRateLimitWindowMs = parsePositiveInt(process.env.POLL_RATE_LIMIT_WINDOW_MS, DEFAULT_WINDOW_MS);

const isRateLimitSkipped = () => process.env.NODE_ENV === 'development';

const resolveRequestPath = (req: Request): string => {
  const baseUrl = req.baseUrl || '';
  const path = req.path || '';
  const combined = `${baseUrl}${path}`;
  if (!combined || combined === '/') {
    return '/';
  }
  return combined.replace(/\/+$/, '');
};

const writeRateLimitExceededLog = (limiterName: LimiterName, req: Request, statusCode: number) => {
  logger.warn('Rate limit exceeded', {
    limiterName,
    statusCode,
    method: req.method,
    path: req.originalUrl || resolveRequestPath(req),
    requestPath: resolveRequestPath(req),
    requestId: req.requestId || 'unknown',
    userId: req.user?.userId || 'anonymous',
    ip: req.ip || req.socket.remoteAddress,
    cfConnectingIp: req.get('cf-connecting-ip'),
    xForwardedFor: req.get('x-forwarded-for'),
    userAgent: req.get('user-agent'),
  });
};

const createLimiter = (
  limiterName: LimiterName,
  options: {
    windowMs: number;
    max: number;
    message?: string;
  }
) =>
  rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    message: options.message,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => isRateLimitSkipped(),
    handler: (req, res, _next, rateLimitOptions) => {
      const statusCode = rateLimitOptions.statusCode || 429;
      writeRateLimitExceededLog(limiterName, req, statusCode);
      const message = typeof rateLimitOptions.message === 'string'
        ? rateLimitOptions.message
        : 'Too many requests, please try again later.';
      res.status(statusCode).json({
        error: {
          message,
          code: 'RATE_LIMITED',
          requestId: req.requestId || 'unknown',
        },
      });
    },
  });

export const authLimiter = createLimiter('auth', {
  windowMs: authRateLimitWindowMs,
  max: authRateLimitMax,
  message: 'Too many authentication attempts, please try again later.',
});

export const generalLimiter = createLimiter('general', {
  windowMs: generalRateLimitWindowMs,
  max: generalRateLimitMax,
});

export const pollingLimiter = createLimiter('polling', {
  windowMs: pollRateLimitWindowMs,
  max: pollRateLimitMax,
});

export const isPollingReadRequest = (req: Pick<Request, 'baseUrl' | 'method' | 'path'>): boolean => {
  const method = req.method.toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    return false;
  }

  const fullPath = resolveRequestPath(req as Request);
  if (fullPath === '/api/orders' || fullPath.startsWith('/api/orders/')) return true;
  if (fullPath === '/api/notifications' || fullPath.startsWith('/api/notifications/')) return true;
  if (fullPath === '/api/contact/messages/count') return true;

  return false;
};

export const resolveLimiterName = (req: Pick<Request, 'baseUrl' | 'method' | 'path'>): 'general' | 'polling' =>
  isPollingReadRequest(req) ? 'polling' : 'general';

export const readWriteLimiter = (req: Request, res: Response, next: NextFunction): void => {
  const limiter = resolveLimiterName(req) === 'polling' ? pollingLimiter : generalLimiter;
  limiter(req, res, next);
};
