// backend/src/middleware/tenant.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { getUnscopedPrisma } from '../config/database';
import { runWithTenant } from '../config/tenantContext';
import jwt from 'jsonwebtoken';

const ROOT_DOMAIN_LABELS = 2;

function subdomainOf(hostname: string): string {
  const labels = hostname.split('.');
  if (labels.length <= ROOT_DOMAIN_LABELS) return '';
  return labels[0];
}

interface JwtPayload {
  tenantId?: number | null;
}

export async function resolveTenant(req: Request, res: Response, next: NextFunction): Promise<void> {
  const host = req.hostname;
  const sub = subdomainOf(host);
  const prisma = getUnscopedPrisma();

  let resolvedTenantId: number | null = null;
  let resolvedSlug: string | null = null;

  // 1. Priority A: Explicit Request Headers (ideal for single-domain SPAs and API testing)
  const headerTenantId = req.headers['x-tenant-id'];
  const headerTenantSlug = req.headers['x-tenant-slug'];

  if (headerTenantId) {
    resolvedTenantId = Number(headerTenantId);
  } else if (headerTenantSlug) {
    resolvedSlug = String(headerTenantSlug);
  }

  // 2. Priority B: JWT Token Context (if user is authenticated, use token tenant)
  if (!resolvedTenantId && !resolvedSlug) {
    const authHeader = req.headers['authorization'];
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req as any).cookies?.accessToken;
    if (token) {
      try {
        const decoded = jwt.decode(token) as JwtPayload | null;
        if (decoded && decoded.tenantId !== undefined) {
          resolvedTenantId = decoded.tenantId;
        }
      } catch (err) {
        // Suppress decode errors here; regular auth middleware handles verification
      }
    }
  }

  // 3. Priority C: Custom Domain / Subdomain resolution
  if (!resolvedTenantId && !resolvedSlug) {
    if (sub === 'admin') {
      req.tenantId = null;
      req.tenant = null;
      req.store = null;
      runWithTenant({ tenantId: 0, storeId: null, scope: 'super-admin' }, () => next());
      return;
    }
    // Apex domain (no subdomain) or www → default tenant.
    // Any other subdomain is treated as a named tenant slug; if not found → 404.
    resolvedSlug = (sub && sub !== 'www') ? sub : 'app';
  }

  // 4. Database Lookup based on resolved identifiers
  let tenant: any = null;
  if (resolvedTenantId !== null) {
    tenant = await prisma.tenant.findUnique({ where: { id: resolvedTenantId } });
  } else if (resolvedSlug !== null) {
    tenant = await prisma.tenant.findFirst({
      where: {
        OR: [
          { customDomain: host },
          { slug: resolvedSlug }
        ]
      }
    });
  }

  // 5. If no tenant found: apex/www route already resolved to slug 'app' above —
  // if even 'app' is missing the DB is misconfigured. Named subdomains that don't
  // match any tenant 404 rather than silently falling through to default data.
  if (!tenant) {
    res.status(404).json({ error: 'Tenant not found' });
    return;
  }

  if (tenant.status !== 'ACTIVE') {
    res.status(403).json({ error: 'This store is suspended' });
    return;
  }

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
}
