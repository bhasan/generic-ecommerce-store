import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { getUnscopedPrisma } from '../config/database';
import { runWithTenant } from '../config/tenantContext';
import { logger } from '../utils/logger';
import { hashMachineToken } from '../utils/machineToken';
import { buildReportingError } from '../utils/reportingEnvelope';
import { getReportingConfig } from '../utils/reportingConfig';

const getBearerToken = (authorizationHeader: string | undefined): string | null => {
  if (!authorizationHeader?.startsWith('Bearer ')) return null;
  return authorizationHeader.slice('Bearer '.length);
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

/**
 * Security-critical: the bearer token IDENTIFIES the tenant.
 *
 * We hash the supplied token and look up the tenant whose `reportingTokenHash`
 * matches. This means:
 *   - A holder of tenant A's token can ONLY access tenant A's data.
 *   - X-Tenant-ID / Host headers are IGNORED for auth — the token IS the tenant.
 *   - The tenant context is re-established here so downstream routes see the
 *     correct tenant regardless of how resolveTenant resolved the request.
 */
export const requireReportingAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const suppliedToken = getBearerToken(req.get('authorization'));

  if (!suppliedToken) {
    logger.warn('Online store reporting API authentication failed: missing bearer token', {
      requestId: req.requestId || 'unknown',
      method: req.method,
      path: req.originalUrl,
      hasAuthorizationHeader: Boolean(req.get('authorization')),
    });
    res.status(401).json(buildReportingError(req, 'Unauthorized', 'UNAUTHORIZED'));
    return;
  }

  const hash = hashMachineToken(suppliedToken);
  const prisma = getUnscopedPrisma();

  const tenant = await prisma.tenant.findFirst({
    where: { reportingTokenHash: hash },
  });

  if (!tenant || tenant.status !== 'ACTIVE') {
    logger.warn('Online store reporting API authentication failed: invalid or tenant inactive', {
      requestId: req.requestId || 'unknown',
      method: req.method,
      path: req.originalUrl,
      tenantFound: Boolean(tenant),
      tenantStatus: tenant?.status ?? null,
    });
    res.status(401).json(buildReportingError(req, 'Unauthorized', 'UNAUTHORIZED'));
    return;
  }

  // The token identifies the tenant — ignore Host/X-Tenant-ID entirely.
  // Re-establish the tenant context for downstream routes.
  const store = await prisma.store.findFirst({
    where: { tenantId: tenant.id, isDefault: true, status: 'ACTIVE' },
  });

  req.tenantId = tenant.id;
  req.tenant = { id: tenant.id, slug: tenant.slug, status: tenant.status };
  req.store = store ? { id: store.id } : null;

  runWithTenant(
    { tenantId: tenant.id, storeId: store?.id ?? null, scope: 'tenant' },
    () => next(),
  );
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
