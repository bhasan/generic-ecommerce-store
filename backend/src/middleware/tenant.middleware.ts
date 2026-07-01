// backend/src/middleware/tenant.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { getUnscopedPrisma } from '../config/database';
import { runWithTenant } from '../config/tenantContext';
import jwt from 'jsonwebtoken';
import { verifyToken } from '../utils/jwt.util';

// Number of labels in the platform's apex domain ("yourapp.com" = 2,
// "yourapp.co.uk" = 3). Configurable so subdomain parsing is correct for any
// apex; a host with this many labels or fewer (incl. "localhost") is treated as
// the apex (no subdomain). Default 2.
const ROOT_DOMAIN_LABELS = Number(process.env.APP_ROOT_DOMAIN_LABELS ?? 2);

function subdomainOf(hostname: string): string {
  const labels = hostname.split('.');
  if (labels.length <= ROOT_DOMAIN_LABELS) return '';
  return labels[0];
}

interface JwtPayload {
  tenantId?: number | null;
}

/**
 * Whether the caller holds a SIGNATURE-VERIFIED ADMIN/SUPER_ADMIN role. Gates the
 * X-Store-Id: 0 "all stores" sentinel — an unauthenticated or non-admin caller
 * must not be able to force store-scoped reads (announcements, contact_messages)
 * to aggregate across every store of the tenant. Uses `verifyToken` (not the
 * unsigned `jwt.decode` used for the tenantId fallback below), so a forged token
 * cannot claim admin. Any missing/invalid/expired token resolves to false — this
 * middleware never rejects the request itself; it only narrows the sentinel.
 */
function isAdminCaller(req: Request): boolean {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.substring(7)
    : (req as any).cookies?.accessToken;
  if (!token) return false;
  try {
    const decoded = verifyToken(token);
    return decoded.roles?.some((r) => r.name === 'ADMIN' || r.name === 'SUPER_ADMIN') ?? false;
  } catch {
    return false;
  }
}

/**
 * Resolve the ACTIVE store: the X-Store-Id store when it belongs to `tenantId` and
 * is ACTIVE, otherwise the tenant's default store. Fail-safe: an invalid/foreign/
 * inactive id silently falls back to the default. `stores` is UNSCOPED, so tenantId
 * is filtered explicitly. `X-Store-Id: 0` (all-stores) is honored only for a
 * verified admin caller — a non-admin sending it is treated as if it were absent.
 */
async function resolveActiveStore(
  prisma: ReturnType<typeof getUnscopedPrisma>,
  tenantId: number,
  headerStoreId: string | undefined,
  isAdmin: boolean,
): Promise<{ id: number; isDefault: boolean } | null> {
  if (headerStoreId) {
    if (headerStoreId === '0') {
      if (isAdmin) return { id: 0, isDefault: false };
      // Non-admin all-stores request: ignore the sentinel, fall through to default.
    } else {
      const id = Number(headerStoreId);
      if (Number.isInteger(id) && id > 0) {
        const selected = await prisma.store.findFirst({
          where: { id, tenantId, status: 'ACTIVE' },
          select: { id: true, isDefault: true },
        });
        if (selected) return { id: selected.id, isDefault: selected.isDefault };
      }
    }
  }
  const def = await prisma.store.findFirst({ where: { tenantId, isDefault: true, status: 'ACTIVE' } });
  return def ? { id: def.id, isDefault: true } : null;
}

/**
 * Resolve the active tenant for a request and run the rest of the request inside
 * its AsyncLocalStorage context. Priority (highest first):
 *
 *   1. Explicit headers  (X-Tenant-ID / X-Tenant-Slug) — dev/test/API override.
 *   2. `admin` subdomain — platform super-admin scope (no tenant).
 *   3. Host  (named subdomain OR custom domain) — HOST WINS OVER THE JWT, so a
 *      user carrying tenant A's token cannot view tenant B's site by visiting
 *      B's host; the token/tenant cross-check in auth middleware then rejects it.
 *      A named subdomain that matches no tenant is a hard 404.
 *   4. JWT tenantId — fallback only when the host carries no tenant (apex / www /
 *      localhost). This is what makes local development work: a developer on
 *      localhost is resolved to whichever tenant they logged in as.
 *   5. Default tenant (`slug: 'app'`) — apex/www anonymous requests.
 */
export async function resolveTenant(req: Request, res: Response, next: NextFunction): Promise<void> {
  const host = req.hostname;
  const sub = subdomainOf(host);
  const prisma = getUnscopedPrisma();

  const headerTenantId = req.headers['x-tenant-id'];
  const headerTenantSlug = req.headers['x-tenant-slug'];
  const hasHeaderOverride = Boolean(headerTenantId || headerTenantSlug);

  let tenant: { id: number; slug: string; status: string } | null = null;

  // 1. Explicit request headers — highest priority (single-domain SPAs, API
  //    tests, local development targeting a specific tenant).
  if (headerTenantId) {
    tenant = await prisma.tenant.findUnique({ where: { id: Number(headerTenantId) } });
  } else if (headerTenantSlug) {
    tenant = await prisma.tenant.findFirst({ where: { slug: String(headerTenantSlug) } });
  }
  if (hasHeaderOverride && !tenant) {
    res.status(404).json({ error: 'Tenant not found' });
    return;
  }

  // 2. The reserved `admin` subdomain → platform super-admin scope (no tenant).
  if (!hasHeaderOverride && sub === 'admin') {
    req.tenantId = null;
    req.tenant = null;
    req.store = null;
    runWithTenant({ tenantId: 0, storeId: null, scope: 'super-admin' }, () => next());
    return;
  }

  // 3. Host-based resolution (named subdomain or custom domain) — beats the JWT.
  if (!tenant && !hasHeaderOverride) {
    const hostSlug = (sub && sub !== 'www') ? sub : null;
    if (hostSlug) {
      tenant = await prisma.tenant.findFirst({
        where: { OR: [{ customDomain: host }, { slug: hostSlug }] },
      });
      // A named subdomain that matches no tenant is a hard 404 — never silently
      // fall through to the JWT/default tenant for an explicit subdomain.
      if (!tenant) {
        res.status(404).json({ error: 'Tenant not found' });
        return;
      }
    } else {
      // Apex / www / localhost: no subdomain, but still honor a tenant that has
      // mapped its OWN apex domain via customDomain.
      tenant = await prisma.tenant.findFirst({ where: { customDomain: host } });
    }
  }

  // 4. JWT fallback — only when the host carried no tenant (apex/localhost). Lets
  //    a logged-in user on the apex/dev host resolve to their own tenant.
  if (!tenant && !hasHeaderOverride) {
    const authHeader = req.headers['authorization'];
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (req as any).cookies?.accessToken;
    if (token) {
      try {
        const decoded = jwt.decode(token) as JwtPayload | null;
        if (decoded && decoded.tenantId != null) {
          tenant = await prisma.tenant.findUnique({ where: { id: decoded.tenantId } });
        }
      } catch {
        // Token verification is the auth middleware's job; ignore decode errors here.
      }
    }
  }

  // 5. Default tenant ('app') — apex/www anonymous requests.
  if (!tenant) {
    tenant = await prisma.tenant.findFirst({ where: { slug: 'app' } });
  }

  if (!tenant) {
    res.status(404).json({ error: 'Tenant not found' });
    return;
  }
  if (tenant.status !== 'ACTIVE') {
    res.status(403).json({ error: 'This store is suspended' });
    return;
  }

  const headerStoreId = req.headers['x-store-id'];
  const store = await resolveActiveStore(
    prisma,
    tenant.id,
    typeof headerStoreId === 'string' ? headerStoreId : undefined,
    isAdminCaller(req),
  );

  req.tenantId = tenant.id;
  req.tenant = { id: tenant.id, slug: tenant.slug, status: tenant.status };
  req.store = store && store.id !== 0 ? { id: store.id } : null;

  runWithTenant(
    { tenantId: tenant.id, storeId: store?.id ?? null, isDefaultStore: store?.isDefault ?? false, scope: 'tenant' },
    () => next(),
  );
}
