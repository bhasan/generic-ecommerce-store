import { Request, Response, NextFunction } from 'express';
import { getUnscopedPrisma } from '../config/database';
import { runWithTenant } from '../config/tenantContext';
import { logger } from '../utils/logger';
import { hashMachineToken } from '../utils/machineToken';

/**
 * Security-critical: the print-agent key IDENTIFIES the tenant.
 *
 * We hash the supplied key and look up the tenant whose `printAgentKeyHash`
 * matches. This means:
 *   - A holder of tenant A's key can ONLY access tenant A's print jobs.
 *   - X-Tenant-ID / Host headers are IGNORED for auth — the key IS the tenant.
 *   - The tenant context is re-established here so downstream routes see the
 *     correct tenant regardless of how resolveTenant resolved the request.
 */
export const authenticatePrintAgent = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const providedKey = req.header('x-print-agent-key');

  if (!providedKey) {
    res.status(401).json({
      error: {
        message: 'Invalid print agent key',
        code: 'INVALID_PRINT_AGENT_KEY',
        requestId: req.requestId || 'unknown',
      },
    });
    return;
  }

  const hash = hashMachineToken(providedKey);
  const prisma = getUnscopedPrisma();

  const tenant = await prisma.tenant.findFirst({
    where: { printAgentKeyHash: hash },
  });

  if (!tenant || tenant.status !== 'ACTIVE') {
    logger.warn('Print agent authentication failed: invalid key or tenant inactive', {
      requestId: req.requestId || 'unknown',
      method: req.method,
      path: req.originalUrl,
      tenantFound: Boolean(tenant),
      tenantStatus: tenant?.status ?? null,
    });
    res.status(401).json({
      error: {
        message: 'Invalid print agent key',
        code: 'INVALID_PRINT_AGENT_KEY',
        requestId: req.requestId || 'unknown',
      },
    });
    return;
  }

  // The key identifies the tenant — ignore Host/X-Tenant-ID entirely.
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
