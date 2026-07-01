# Multi-Tenancy Guide

**Applies to:** `feature/multi-tenant` branch (Phase 1 foundation)
**Audience:** developers and operators who run or manage this application

---

## Table of Contents

1. [Overview](#1-overview)
2. [How the App Determines the Active Tenant](#2-how-the-app-determines-the-active-tenant)
3. [How Isolation Actually Works](#3-how-isolation-actually-works)
4. [Tenant-Aware Auth](#4-tenant-aware-auth)
5. [Creating and Managing Tenants](#5-creating-and-managing-tenants)
6. [Per-Tenant Website and Branding](#6-per-tenant-website-and-branding)
7. [Deployment and Infrastructure Requirements](#7-deployment-and-infrastructure-requirements)
8. [Day-to-Day Usage and Operations](#8-day-to-day-usage-and-operations)
9. [Known Limitations and Roadmap](#9-known-limitations-and-roadmap)

---

## 1. Overview

The app runs a single shared Postgres instance serving multiple isolated tenants. The hierarchy is:

```
Tenant (owning business)
  └── Store (storefront / location)
        ├── Users  (tenant-scoped; can shop any store in the tenant)
        ├── Orders (store-scoped; tied to the specific store)
        └── Products / Catalog (tenant-scoped master catalog)
```

**Key entities (from `prisma/schema.prisma`):**

```prisma
model Tenant {
  id           Int          @id @default(autoincrement())
  slug         String       @unique   // maps to subdomain or resolution key
  name         String
  customDomain String?      @unique   // optional custom FQDN
  status       TenantStatus @default(ACTIVE)  // ACTIVE | SUSPENDED
  plan         String?
  stores       Store[]
  @@map("tenants")
}

model Store {
  id        Int         @id @default(autoincrement())
  tenantId  Int?
  name      String
  slug      String
  isDefault Boolean     @default(false)
  status    StoreStatus @default(ACTIVE)  // ACTIVE | SUSPENDED
  @@unique([tenantId, slug])
  @@map("stores")
}
```

Phase 1 ships one default store per tenant. Multi-store selection is Phase 2.

### Built-in tenants

| Slug | Purpose | Created by |
|------|---------|-----------|
| `app` | Default tenant. Resolves for apex/`www` domains. Cannot be deleted. | `prisma/seed.ts` |
| `demo` | Public demo with fake catalog, staged orders, and known credentials. | `npm run prisma:seed:demo` |

At boot, the server calls `verifyDefaultTenant()` which looks up `slug: 'app'` and caches its numeric `id`. If the row is missing, the server refuses to start:

```typescript
// backend/src/config/verifyDefaultTenant.ts
const tenant = await prisma.tenant.findFirst({ where: { slug: 'app' } });
if (!tenant) {
  throw new Error('FATAL: Default tenant (slug: app) is missing...');
}
setDefaultTenantId(tenant.id);
```

---

## 2. How the App Determines the Active Tenant

Every request to `/api` passes through `resolveTenant` middleware (`backend/src/middleware/tenant.middleware.ts`). It resolves the tenant from the request using a strict priority chain, then wraps the rest of the call stack in `runWithTenant(...)`.

### Priority chain (in order)

| Priority | Source | Header / mechanism |
|----------|--------|--------------------|
| 1 | Explicit request header — ID | `X-Tenant-ID: <numeric id>` |
| 2 | Explicit request header — slug | `X-Tenant-Slug: acme` |
| 3 | JWT token `tenantId` claim | Bearer token decoded (no sig verify here) |
| 4 | `admin` subdomain | hard-codes `scope: 'super-admin'`; skips DB lookup |
| 5 | Custom domain match | `Tenant.customDomain = req.hostname` |
| 6 | Subdomain slug | `acme.yourapp.com` → `slug = 'acme'` |
| 7 | Apex / `www` | falls back to `slug = 'app'` |

Steps 1–3 set either `resolvedTenantId` or `resolvedSlug`. Steps 4–7 are entered only when neither header nor JWT tenantId is present.

```
GET /api/orders HTTP/1.1
Host: acme.yourapp.com
```
→ subdomain `acme` → DB lookup `{ OR: [{ customDomain: host }, { slug: 'acme' }] }` → tenant found.

### Database lookup

After the priority chain resolves an ID or slug, one of these queries runs (using `getUnscopedPrisma()` — the unscoped client — because tenant rows themselves are global):

```typescript
// by ID:
tenant = await prisma.tenant.findUnique({ where: { id: resolvedTenantId } });
// by slug or custom domain:
tenant = await prisma.tenant.findFirst({
  where: { OR: [{ customDomain: host }, { slug: resolvedSlug }] }
});
```

### Outcomes

| Condition | HTTP response |
|-----------|--------------|
| Tenant not found | `404 { "error": "Tenant not found" }` |
| Tenant found, `status !== 'ACTIVE'` | `403 { "error": "This store is suspended" }` |
| Tenant found and active | Middleware sets `req.tenantId`, `req.tenant`, `req.store`, then calls `runWithTenant(...)` |

After a successful lookup, the middleware also fetches the default active store for that tenant and passes both `tenantId` and `storeId` into the ALS context.

### The `admin` subdomain (super-admin)

`admin.*` is detected before any DB lookup and immediately calls:

```typescript
runWithTenant({ tenantId: 0, storeId: null, scope: 'super-admin' }, () => next());
```

`req.tenantId` is set to `null`. All subsequent auth checks must verify `SUPER_ADMIN` role.

---

## 3. How Isolation Actually Works

### AsyncLocalStorage context

`runWithTenant` stores `{ tenantId, storeId, scope }` in Node's `AsyncLocalStorage`. Every async operation spawned inside the callback (including awaited Prisma queries, nested service calls, and event handlers) inherits this context automatically. No value is passed through function arguments.

```typescript
// backend/src/config/tenantContext.ts
export type TenantContext = {
  tenantId: number;
  storeId: number | null;
  scope: 'tenant' | 'super-admin';
};
const tenantStorage = new AsyncLocalStorage<TenantContext>();

export function runWithTenant<T>(ctx: TenantContext, fn: () => T): T {
  return tenantStorage.run(ctx, () => { ... });
}
```

### Prisma client extension (isolation core)

`buildTenantClient()` in `backend/src/config/database.ts` wraps the base Prisma client with a `$extends` hook that intercepts **every** query operation on every model. For each operation it:

1. Checks if the table is in `UNSCOPED_TABLES` — if so, passes through without any filter injection.
2. Reads the current ALS context via `getTenantContext()`.
3. **Fails closed** if context is absent and the environment is `production`, `test`, or Vitest is running (throws `MissingTenantContextError`). In plain development without Vitest a console warning is emitted and the query passes through — this is a convenience-only path; use `getUnscopedPrisma()` for scripts.
4. For **write operations** (`create`, `upsert`, `createMany`) injects `tenantId` (and `storeId` for store-scoped tables) into `data`.
5. For **read/mutate operations** (`findFirst`, `findMany`, `update`, `updateMany`, `delete`, `deleteMany`, `count`, `aggregate`, `groupBy`) appends `tenantId` (and `storeId`) to the `where` clause.
6. Rewrites `findUnique` as `findFirst` with the tenant filter appended (because Prisma's `findUnique` requires an exact unique-key match and cannot accept extra `where` fields directly).

Nested relation creates/updates are also walked and injected via `injectNestedRelations`.

### Table scoping classification

Defined in `backend/src/config/tenantScope.ts`:

| Classification | Tables | What gets injected |
|---------------|--------|--------------------|
| **Unscoped** | `roles`, `address_geocode_cache`, `tenants`, `stores`, `refresh_tokens` | Nothing — queries pass through raw |
| **Store-scoped** | `orders`, `order_items`, `order_status_events`, `payments`, `cart_items`, `print_jobs`, `pos_outbox`, `order_pos_mappings`, `announcements`, `contact_messages` | `tenantId` + `storeId` |
| **Tenant-scoped** | Everything else (`users`, `products`, `categories`, `ui_settings`, etc.) | `tenantId` only |

### Two Prisma clients

| Function | Client | Use case |
|----------|--------|---------|
| `getTenantPrisma()` | Tenant-scoped (extended) | All business logic in controllers and services |
| `getUnscopedPrisma()` | Raw base client | Seeds, migrations, workers reading cross-tenant rows, boot-time lookups |

`getUnscopedPrisma()` bypasses all injection. Use it only when you have a deliberate reason to read or write outside tenant scope (e.g., seeding global roles, the tenant resolution middleware itself, or cross-tenant reporting workers).

### MissingTenantContextError

If a query runs through the scoped client with no ALS context in production or under the test runner, the extension throws:

```
MissingTenantContextError: Execution context is missing active tenantScope.
Wrap database operations inside runWithTenant(...) first.
```

This is the fail-closed mechanism. It means a code path reached a Prisma query without first being wrapped by `resolveTenant` middleware or an explicit `runWithTenant(...)` call.

---

## 4. Tenant-Aware Auth

### JWT payload

Access tokens (short-lived, 15 minutes by default) carry:

```json
{
  "userId": 42,
  "username": "bilal",
  "tenantId": 3,
  "roles": [
    { "name": "ADMIN",      "storeId": null },
    { "name": "CUSTOMER",   "storeId": null }
  ]
}
```

`tenantId: null` in the JWT means the user is a super-admin with access above all tenants.

### Token-tenant cross-check

The `authenticate` middleware (`backend/src/middleware/auth.middleware.ts`) verifies the signature via `verifyToken()` and then cross-checks the token's tenant against the already-resolved `req.tenantId`:

```typescript
if (req.tenantId !== undefined && tokenTenantId !== null && tokenTenantId !== req.tenantId) {
  res.status(401).json({ error: 'Invalid or expired token' });
  return;
}
```

A token minted for tenant A is rejected on tenant B. Super-admin tokens (`tenantId === null`) are exempt from this check.

### Legacy-token grace path

Tokens issued before the multi-tenancy migration lack a `tenantId` claim (`decoded.tenantId === undefined`). The middleware maps these strictly to the default tenant ID cached at boot:

```typescript
if (decoded.tenantId === undefined) {
  const defaultId = getDefaultTenantId();
  if (defaultId === null) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }
  tokenTenantId = defaultId;
}
```

If the boot-time cache is uninitialized (server started abnormally), the guard fails closed with 401 rather than falling through. Legacy tokens presented on a non-default subdomain are also rejected by the cross-check above.

### Role authorization

`authorize(...roles)` in `backend/src/middleware/role.middleware.ts` checks `req.user.roles` against the required role list. Store-scoped roles (e.g. MANAGEMENT with `storeId = 5`) only match if `r.storeId === null` (tenant-wide) or `r.storeId === req.store.id` (the request's active store). `SUPER_ADMIN` bypasses both role and store checks.

| Role | Scope | Notes |
|------|-------|-------|
| `SUPER_ADMIN` | Platform (`tenantId = null`) | Only valid on `admin.*` context |
| `ADMIN` | Tenant-wide (`storeId = null`) | Full access within their tenant |
| `MANAGEMENT` | Store-scoped | Order management for one store |
| `EMPLOYEE` | Store-scoped | Operational access for one store |
| `DELIVERY_DRIVER` | Store-scoped | Delivery workflow |
| `CUSTOMER` | Tenant-wide | Shopper account |
| `VIP` | Tenant-wide | Shopper with elevated access |
| `GUEST` | Tenant-wide | Pre-registration |

---

## 5. Creating and Managing Tenants

There is no super-admin UI in Phase 1. Tenants are created via seed scripts or direct SQL/Prisma Studio.

### Seed pattern (recommended)

Both built-in tenants follow this pattern (see `prisma/seed.ts` and `prisma/seed-demo.ts`):

```typescript
// Always use getUnscopedPrisma() — tenant rows are unscoped globals
const prisma = getUnscopedPrisma();

// 1. Create (or find) the tenant
let tenant = await prisma.tenant.findFirst({ where: { slug: 'acme' } });
if (!tenant) {
  tenant = await prisma.tenant.create({
    data: { slug: 'acme', name: 'Acme Smoke Shop', status: 'ACTIVE' },
  });
}
const tenantId = tenant.id;

// 2. Create the default store
let store = await prisma.store.findFirst({ where: { tenantId, slug: 'main' } });
if (!store) {
  store = await prisma.store.create({
    data: { tenantId, name: 'Main Location', slug: 'main', isDefault: true, status: 'ACTIVE' },
  });
}
```

Every subsequent row (users, products, orders) must carry `tenantId` on the direct create data. The scoped Prisma client injects this automatically when called inside `runWithTenant(...)`, but seed scripts typically call `getUnscopedPrisma()` and set `tenantId` explicitly.

### Demo tenant

```bash
cd backend && npm run prisma:seed:demo
```

The script is fully idempotent: it wipes and recreates all demo products, orders, and users on every run (the tenant and store rows are upserted). Demo credentials:

| Username | Role | Password |
|----------|------|---------|
| `demo-manager` | MANAGEMENT (store-scoped) | `demo1234` |
| `demo-customer` | CUSTOMER (tenant-wide) | `demo1234` |

### Direct SQL bootstrap

```sql
INSERT INTO tenants (slug, name, status, "createdAt", "updatedAt")
VALUES ('acme', 'Acme Smoke Shop', 'ACTIVE', now(), now());

INSERT INTO stores ("tenantId", name, slug, "isDefault", status, "createdAt", "updatedAt")
SELECT id, 'Main Location', 'main', true, 'ACTIVE', now(), now()
FROM tenants WHERE slug = 'acme';
```

### Suspending a tenant

Suspension blocks all requests immediately with a 403. Data is preserved.

```sql
-- Suspend
UPDATE tenants SET status = 'SUSPENDED', "updatedAt" = now() WHERE slug = 'acme';

-- Reactivate
UPDATE tenants SET status = 'ACTIVE', "updatedAt" = now() WHERE slug = 'acme';
```

The check happens at the very end of `resolveTenant`, after the DB lookup:

```typescript
if (tenant.status !== 'ACTIVE') {
  res.status(403).json({ error: 'This store is suspended' });
  return;
}
```

### Tenant fields reference

| Field | Type | Notes |
|-------|------|-------|
| `slug` | `String @unique` | Maps to subdomain. Changing it after creation requires a data migration. |
| `name` | `String` | Display name. |
| `status` | `TenantStatus` | `ACTIVE` or `SUSPENDED`. |
| `plan` | `String?` | Billing plan identifier. Not enforced in Phase 1. |
| `customDomain` | `String? @unique` | FQDN for custom-domain resolution (e.g. `store.acmesmoke.com`). |

### Store fields reference

| Field | Type | Notes |
|-------|------|-------|
| `tenantId` | `Int?` | FK to owning tenant. |
| `slug` | `String` | Unique within the tenant (`@@unique([tenantId, slug])`). |
| `name` | `String` | Display name. |
| `isDefault` | `Boolean` | Exactly one store per tenant should be `true`. |
| `status` | `StoreStatus` | `ACTIVE` or `SUSPENDED`. |

---

## 6. Per-Tenant Website and Branding

### Settings storage

All per-tenant website configuration is stored as JSON blobs in the `ui_settings` table under named keys. The `SettingsStore<T>` class (`backend/src/services/settingsStore.ts`) wraps `getTenantPrisma().uiSetting` so every read and write is automatically scoped to the active tenant. The in-memory TTL cache (default 30 s, configurable via `SETTINGS_CACHE_TTL_MS`) is keyed by `${tenantId}:${settingKey}` so one tenant's cached values are never served to another.

Settings services and their keys:

| Service | Key | What it controls |
|---------|-----|-----------------|
| `BrandingService` | `branding` | Store name, tagline, logo URL, hero image, favicon URLs, color palette |
| `LandingPageSettingsService` | `landingPage` | Hero copy, CTA text, featured sections |
| `StoreSettingsService` | `storeSettings` | Operating hours, delivery zones, printer config |
| `PaymentSettingsService` | `paymentSettings` | Accepted payment methods, CashApp handle, etc. |
| `OrderingConstraintsService` | `orderingConstraints` | Min order value, delivery radius, schedule rules |

Each tenant's admin dashboard writes to these settings and they surface exclusively on that tenant's site.

### Per-tenant media uploads

Uploaded images (logos, hero images, product photos) are stored under:

```
uploads/tenants/<tenantId>/<filename>
```

and served by a guarded route in `backend/src/index.ts`:

```typescript
app.get('/api/uploads/tenants/:tenantId/:filename', (req, res) => {
  const filePath = resolveTenantUploadPath(
    Number(req.params.tenantId),
    req.params.filename,
    getTenantContext(),
  );
  if (!filePath) { res.status(404).json({ error: 'Not found' }); return; }
  res.sendFile(filePath, { maxAge: '30d', immutable: true }, ...);
});
```

`resolveTenantUploadPath` (`backend/src/utils/fileUtils.ts`) enforces:
- The requested `tenantId` must be an integer.
- The ALS context must be present (fail closed if request bypassed `resolveTenant`).
- A `tenant`-scoped context may only read files under its own tenant's directory.
- A `super-admin`-scoped context may read any tenant's files.
- `path.basename()` strips any directory traversal from the filename.

Any `/api/uploads/tenants/*` path that does not match the exact route pattern is denied with 404 before reaching the broad legacy static-file mount.

On-disk directory creation is on demand via `tenantUploadsDir(tenantId)`.

### Tenant website routing

Each tenant's site is reached by one of three methods:

| Method | Example | What to configure |
|--------|---------|------------------|
| Subdomain | `acme.yourapp.com` | Wildcard DNS + wildcard TLS (see Section 7) |
| Custom domain | `store.acmesmoke.com` | Set `Tenant.customDomain`, tenant adds CNAME, provision TLS cert |
| Header-based (single domain) | `yourapp.com` + `X-Tenant-Slug: acme` | No DNS changes |

---

## 7. Deployment and Infrastructure Requirements

### Current nginx setup

Both `nginx/nginx.conf` (dev/Docker Compose) and `nginx/nginx.prod.conf` (production) listen on port 80 only, pass the `Host` header through to the backend (`proxy_set_header Host $host`), and proxy all `/api/*` traffic to the backend container. The backend's `req.hostname` receives the full hostname, which `resolveTenant` uses for subdomain and custom-domain detection.

**TLS and wildcard are not yet wired.** The prod config has TLS and HTTPS-redirect blocks present but commented out:

```nginx
# listen 443 ssl;
# server_name your-domain.com www.your-domain.com;
# ssl_certificate /etc/nginx/ssl/fullchain.pem;
# ssl_certificate_key /etc/nginx/ssl/privkey.pem;
```

HTTP host passthrough works today. Subdomain-based tenant isolation works over HTTP in a lab environment but cannot be used in production without TLS.

### What must be in place for per-tenant subdomains

1. **Wildcard DNS** — add a wildcard A record pointing `*.yourapp.com` to your server IP.
2. **Wildcard TLS certificate** — obtain a wildcard cert for `*.yourapp.com` (Let's Encrypt / Certbot with DNS-01 challenge or a managed cert via Cloudflare, AWS ACM, etc.).
3. **nginx wildcard server\_name** — update the prod config:

```nginx
listen 443 ssl;
server_name yourapp.com *.yourapp.com;
ssl_certificate     /etc/nginx/ssl/wildcard.fullchain.pem;
ssl_certificate_key /etc/nginx/ssl/wildcard.privkey.pem;
```

4. The backend application code requires no changes — subdomain extraction already works via `req.hostname`.

### What must be in place for custom domains

1. **Tenant sets** `customDomain = 'store.acmesmoke.com'` in the database.
2. **Tenant's DNS** — their domain CNAME points to your server or Cloudflare proxy.
3. **Per-domain TLS** — provision a cert for `store.acmesmoke.com` (Certbot standalone or Caddy which auto-provisions). If using Cloudflare, their universal SSL covers this automatically in proxy mode.
4. nginx `server_name` must either be a wildcard that covers the custom domain or the domain must be added explicitly. Caddy or a reverse proxy that supports automatic HTTPS (e.g. Traefik) simplifies this considerably.

### Connection pooling

The app uses standard Prisma with a single PostgreSQL connection pool shared across all tenants. This is compatible with PgBouncer in Transaction Mode since tenant injection is stateless — no per-session configuration variables are set.

Connection limits can be tuned via environment variables:

```env
DB_CONNECTION_LIMIT=20   # connections per process
DB_POOL_TIMEOUT=10       # seconds to wait for a free connection
```

---

## 8. Day-to-Day Usage and Operations

### Testing locally without subdomains

Use the `X-Tenant-Slug` header to target a specific tenant from a single-domain setup. This takes priority over everything except `X-Tenant-ID`.

```bash
# Target the demo tenant via curl
curl -H "X-Tenant-Slug: demo" http://localhost:3000/api/products

# Target by numeric ID
curl -H "X-Tenant-ID: 2" http://localhost:3000/api/products
```

The header approach also works in Postman, Insomnia, and browser-based fetch calls. No DNS setup required.

### Background workers re-entering tenant context

Background workers read cross-tenant rows using `getUnscopedPrisma()` (bypassing the extension) and then wrap each row's processing in an explicit `runWithTenant(...)` call to provide the correct context for any downstream scoped operations:

```typescript
// backend/src/services/pos/orders/outboxWorker.ts
export async function processOutboxRow(
  row: { id: number; tenantId: number; storeId: number | null },
  handler: () => Promise<void>,
): Promise<void> {
  await runWithTenant(
    { tenantId: row.tenantId, storeId: row.storeId, scope: 'tenant' },
    handler,
  );
}
```

Every background job that touches tenant-scoped tables must follow this pattern. Forgetting to wrap in `runWithTenant` will throw `MissingTenantContextError` in production.

### Running the cross-tenant isolation tests

CI guardrails live under `backend/src/integration/`:

```bash
cd backend

# Tenant isolation: confirms a scoped query cannot read another tenant's rows
npx vitest run src/integration/tenantIsolation.test.ts

# Schema scope coverage: confirms every scoped table is classified in tenantScope.ts
npx vitest run src/integration/schemaScope.test.ts

# Run all integration tests
npx vitest run src/integration/
```

The isolation tests set up two separate tenants, insert data under each, and assert that a tenant-scoped query returns only its own rows. The schema scope test loads `tenantScope.ts` and the Prisma schema and verifies every model with a `tenantId` column is either in `UNSCOPED_TABLES` or will have `tenantId` injected by the extension.

### Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `MissingTenantContextError` thrown | A scoped query ran outside `runWithTenant`. Route bypassed `resolveTenant`, or a background job skipped context setup. | Ensure the route is mounted under `/api` (where `resolveTenant` is applied). For workers, wrap in `runWithTenant(...)`. |
| `404 { "error": "Tenant not found" }` on a subdomain | No tenant row has `slug` matching the subdomain and no `customDomain` match. | Create the tenant row or check the slug spelling. |
| `403 { "error": "This store is suspended" }` | Tenant exists but `status = 'SUSPENDED'`. | `UPDATE tenants SET status = 'ACTIVE' WHERE slug = '...'` |
| `401 { "error": "Invalid or expired token" }` on a valid token | Token's `tenantId` does not match the resolved tenant. Token minted under tenant A, but request sent to tenant B's subdomain. | Use the correct subdomain/header for the tenant the token belongs to, or re-authenticate. |
| `FATAL: Default tenant (slug: app) is missing` on startup | The `app` tenant row does not exist — migrations haven't run or seed was skipped. | Run `npx prisma migrate deploy && npm run prisma:seed` inside the backend container. |
| Settings from one tenant leaking to another in dev | `SettingsStore` in-memory cache using key `0:branding` (context absent). | Ensure requests go through `resolveTenant`. The cache key includes `tenantId`; without context it collapses to `0`. |

---

## 9. Known Limitations and Roadmap

| Item | Status | Phase |
|------|--------|-------|
| Super-admin console UI (create/suspend tenants, manage plans) | Not built | Phase 3 |
| Per-store catalog overrides (`StoreVariantOverride` — price/stock/visibility per store) | Not built | Phase 2 |
| Location picker / store-switching UX | Not built | Phase 2 |
| Staff multi-store assignment UI | Not built | Phase 2 |
| TLS/wildcard nginx wiring for production | Not wired (commented out in `nginx.prod.conf`) | Operational work |
| Self-service tenant signup | Not built | Phase 3+ |
| Anonymous public-site config rendering (landing page served to unauthenticated visitors without requiring auth) | Being hardened | Phase 1 follow-up |
| Unique constraint hardening on a small number of cross-tenant nullable columns | Being hardened | Phase 1 follow-up |
| Per-tenant database (`Tenant.dbUrl` → dedicated Prisma client) | Designed, not implemented | Phase 3+ |

### Phase summaries

- **Phase 1 (done):** Tenant/Store models; `tenantId`/`storeId` columns across all scoped tables; Prisma extension isolation; `resolveTenant` middleware; tenant-aware JWT with cross-check; scoped roles; demo tenant seed; CI isolation guardrails.
- **Phase 2:** Multi-store mechanics — location picker, per-store stock/price overrides, store-scoped dashboards.
- **Phase 3:** Super-admin console — create/suspend tenants via UI, manage plans and branding; later self-service tenant signup.
