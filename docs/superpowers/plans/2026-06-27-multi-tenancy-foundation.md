# Multi-Tenancy Foundation (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `Tenant → Store` multi-tenancy foundation with ORM-level query filtering as the authoritative isolation mechanism, wrapping all existing single-tenant data into one default tenant, and seed an isolated Demo tenant.

**Architecture:** Each request resolves a tenant from its subdomain and stores `{ tenantId, storeId, scope }` in an `AsyncLocalStorage`. An extended Prisma client automatically injects these context keys to query filters (`where` clauses) and query data objects (`data` inputs). App business logic remains tenant-blind. The database requires no custom PostgreSQL roles, connection hooks, session variables, or RLS policies.

**Tech Stack:** Node + Express + TypeScript, Prisma (Postgres), vitest. Existing JWT auth (access token 15m + httpOnly refresh cookie).

## Global Constraints

- Tests run with `npx vitest run <path>` from `backend/`. Use vitest (`describe/it/expect`, `vi.mock`).
- Prisma client is generated to `backend/generated/prisma` (not `@prisma/client`). Import enums/types from `../../generated/prisma`.
- Migrations are raw SQL dirs under `backend/prisma/migrations/<timestamp>_<name>/migration.sql`; create with `npx prisma migrate dev --name <name>`.
- Scope columns (`tenantId`/`storeId`) MUST be modeled as standard `Int` (or `Int?` where nullability is design-required, e.g., platform-level access or announcements) without `dbgenerated` defaults. The Prisma Client Extension query hooks automatically manage scope injection on reads and writes.
- Role names live in `src/constants/roles.ts` `ROLE_NAMES`. JWT payload type lives in `src/utils/jwt.util.ts`.
- All commits go on the `feature/multi-tenant` branch.

---

## Test DB Setup

Verified environment facts:
- The DB is **real Postgres 16** (`postgres:16-alpine`), reachable as `db:5432` inside the `smoke-station-delivery-backend` container and as `localhost:15432` from the WSL host.
- Tests run inside the backend container (where `db` resolves).
- Since tenant isolation is enforced at the application level (via the Prisma client extension), we do not need custom database roles, superuser privilege assertions, or session-variable connections. Standard vitest database runners are compatible without modifications.

---

## Production Deployment & Rollout

Because isolation is managed at the application level, production deployment is straightforward and risk-free:
- **No privilege split:** The Node app connects to Postgres using a single connection string (`DATABASE_URL`).
- **Connection pooling:** Fully compatible with connection poolers (PgBouncer) in **Transaction Mode** since Prisma query filtering is completely stateless and has no connection context session variables.
- **Deploy ordering:**
  1. Run migrations: `prisma migrate deploy` adds columns as nullable $\rightarrow$ default tenant seeded $\rightarrow$ backfills existing rows to default tenant $\rightarrow$ alters columns to `NOT NULL` and drops global unique indexes to add tenant-scoped composite unique keys.
  2. Deploy application container containing the new Prisma client extension.
- **Default tenant slug = real prod hostname.** The backfill tags existing data with the default tenant whose `slug` must equal the production subdomain.
- **JWT grace path is REQUIRED in prod.** Legacy tokens missing a `tenantId` are mapped strictly to the default tenant (ID = 1). If a legacy token is presented on a non-default subdomain, the request is rejected (401).
- **Subdomain routing infra.** Wildcard DNS (`*.domain`), wildcard TLS certificate, and nginx wildcard `server_name` forwarding is required to route subdomain requests.

---

## File Structure

**New files:**
- `backend/src/config/tenantContext.ts` — ALS store + `runWithTenant`/`getTenantContext`/`getTenantContextOrThrow`.
- `backend/src/config/tenantScope.ts` — UNSCOPED table allowlist + scope helpers (single source of truth).
- `backend/src/middleware/tenant.middleware.ts` — subdomain → tenant resolution, wraps request in ALS.
- `backend/prisma/migrations/<ts>_multitenancy_core/migration.sql` — Tenant/Store tables, scope columns, default tenant backfill, and composite unique keys.
- `backend/prisma/seed-demo.ts` — Demo tenant seed.
- Test files colocated next to each unit (`*.test.ts`) + `backend/src/integration/tenantIsolation.test.ts`.

**Modified files:**
- `backend/prisma/schema.prisma` — Tenant/Store models, scope fields, relations, composite unique indexes.
- `backend/src/config/database.ts` — tenant-scoped client factory with query extension filters.
- `backend/src/utils/jwt.util.ts` — `tenantId` + scoped roles in `JwtPayload`.
- `backend/src/services/auth.service.ts` — emit `tenantId` + scoped roles in tokens.
- `backend/src/middleware/auth.middleware.ts` — cross-check token tenant vs resolved tenant.
- `backend/src/middleware/role.middleware.ts` — store-aware role checks.
- `backend/src/index.ts` — mount tenant middleware before auth/routes.
- `backend/src/types/express.d.ts` — `req.tenantId`, `req.store`, `req.tenant`.
- Background workers (`outboxWorker.ts`, `posOrderService.ts`, `printJob.service.ts`) — enter ALS context per row.

---

## Task 1: Tenant context (AsyncLocalStorage)

**Files:**
- Create: `backend/src/config/tenantContext.ts`
- Test: `backend/src/config/tenantContext.test.ts`

**Interfaces:**
- Produces:
  - `type TenantContext = { tenantId: number; storeId: number | null; scope: 'tenant' | 'super-admin' }`
  - `runWithTenant<T>(ctx: TenantContext, fn: () => T): T`
  - `getTenantContext(): TenantContext | undefined`
  - `getTenantContextOrThrow(): TenantContext` (throws `MissingTenantContextError`)
  - `class MissingTenantContextError extends Error`

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/config/tenantContext.test.ts
import { describe, it, expect } from 'vitest';
import {
  runWithTenant,
  getTenantContext,
  getTenantContextOrThrow,
  MissingTenantContextError,
} from './tenantContext';

describe('tenantContext', () => {
  it('returns undefined outside a context', () => {
    expect(getTenantContext()).toBeUndefined();
  });

  it('exposes the context inside runWithTenant', () => {
    const result = runWithTenant(
      { tenantId: 42, storeId: 7, scope: 'tenant' },
      () => getTenantContext(),
    );
    expect(result).toEqual({ tenantId: 42, storeId: 7, scope: 'tenant' });
  });

  it('isolates nested contexts and restores the outer one', () => {
    runWithTenant({ tenantId: 1, storeId: null, scope: 'tenant' }, () => {
      runWithTenant({ tenantId: 2, storeId: null, scope: 'tenant' }, () => {
        expect(getTenantContext()?.tenantId).toBe(2);
      });
      expect(getTenantContext()?.tenantId).toBe(1);
    });
  });

  it('getTenantContextOrThrow throws outside a context', () => {
    expect(() => getTenantContextOrThrow()).toThrow(MissingTenantContextError);
  });

  it('propagates context across awaits', async () => {
    const seen = await runWithTenant(
      { tenantId: 9, storeId: null, scope: 'tenant' },
      async () => {
        await Promise.resolve();
        return getTenantContext()?.tenantId;
      },
    );
    expect(seen).toBe(9);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/config/tenantContext.test.ts`
Expected: FAIL — cannot find module `./tenantContext`.

- [ ] **Step 3: Write minimal implementation**

```ts
// backend/src/config/tenantContext.ts
import { AsyncLocalStorage } from 'async_hooks';

export type TenantContext = {
  tenantId: number;
  storeId: number | null;
  scope: 'tenant' | 'super-admin';
};

export class MissingTenantContextError extends Error {
  constructor() {
    super('No tenant context is active for this operation.');
    this.name = 'MissingTenantContextError';
  }
}

const storage = new AsyncLocalStorage<TenantContext>();

export function runWithTenant<T>(ctx: TenantContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function getTenantContext(): TenantContext | undefined {
  return storage.getStore();
}

export function getTenantContextOrThrow(): TenantContext {
  const ctx = storage.getStore();
  if (!ctx) throw new MissingTenantContextError();
  return ctx;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/config/tenantContext.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/config/tenantContext.ts backend/src/config/tenantContext.test.ts
git commit -m "feat(tenancy): add AsyncLocalStorage tenant context"
```

---

## Task 2: Scope classification (single source of truth)

**Files:**
- Create: `backend/src/config/tenantScope.ts`
- Test: `backend/src/config/tenantScope.test.ts`

**Interfaces:**
- Produces:
  - `const UNSCOPED_TABLES: ReadonlySet<string>` — table names with no RLS (`roles`, `address_geocode_cache`, `tenants`, `stores`, `refresh_tokens`).
  - `const STORE_SCOPED_TABLES: ReadonlySet<string>` — tables that also carry `store_id`.
  - `isUnscoped(table: string): boolean`
  - `isStoreScoped(table: string): boolean`

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/config/tenantScope.test.ts
import { describe, it, expect } from 'vitest';
import { UNSCOPED_TABLES, STORE_SCOPED_TABLES, isUnscoped, isStoreScoped } from './tenantScope';

describe('tenantScope', () => {
  it('treats infra tables as unscoped', () => {
    expect(isUnscoped('roles')).toBe(true);
    expect(isUnscoped('refresh_tokens')).toBe(true);
    expect(isUnscoped('products')).toBe(false);
  });

  it('classifies store-scoped tables', () => {
    expect(isStoreScoped('orders')).toBe(true);
    expect(isStoreScoped('payments')).toBe(true);
    expect(isStoreScoped('products')).toBe(false);
  });

  it('keeps the two sets disjoint', () => {
    for (const t of STORE_SCOPED_TABLES) {
      expect(UNSCOPED_TABLES.has(t)).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/config/tenantScope.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// backend/src/config/tenantScope.ts
// Single source of truth for tenant-isolation scoping. Mirrors the Prisma @@map
// table names. UNSCOPED tables get no RLS; STORE_SCOPED tables carry store_id in
// addition to tenant_id. Everything else is tenant-scoped (tenant_id only).
export const UNSCOPED_TABLES: ReadonlySet<string> = new Set([
  'roles',
  'address_geocode_cache',
  'tenants',
  'stores',
  'refresh_tokens',
]);

export const STORE_SCOPED_TABLES: ReadonlySet<string> = new Set([
  'orders',
  'order_items',
  'order_status_events',
  'payments',
  'cart_items',
  'print_jobs',
  'pos_outbox',
  'order_pos_mappings',
  'announcements',
  'contact_messages',
]);

export function isUnscoped(table: string): boolean {
  return UNSCOPED_TABLES.has(table);
}

export function isStoreScoped(table: string): boolean {
  return STORE_SCOPED_TABLES.has(table);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/config/tenantScope.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/config/tenantScope.ts backend/src/config/tenantScope.test.ts
git commit -m "feat(tenancy): add scope classification source of truth"
```

---

## Task 3: Prisma schema — Tenant/Store models + scope fields

**Files:**
- Modify: `backend/prisma/schema.prisma`

**Interfaces:**
- Produces: Prisma models `Tenant`, `Store`; `tenantId Int` (or `Int?` for `User`) on scoped models; `storeId Int` on store-scoped models (or `Int?` for announcements/messages); `User.tenantId`, `UserRole.storeId`.

> Note: scope columns are declared as standard fields (e.g., `Int`). Since we are handling Choice A (migrating existing data), the SQL migration will add them as nullable, backfill the default tenant/store IDs, and then alter the columns to `NOT NULL`. This matches our final Prisma schema definitions.

- [ ] **Step 1: Add the new models and enums to `schema.prisma`**

```prisma
model Tenant {
  id           Int          @id @default(autoincrement())
  slug         String       @unique
  name         String
  customDomain String?      @unique
  status       TenantStatus @default(ACTIVE)
  plan         String?
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt
  stores       Store[]
  @@map("tenants")
}

model Store {
  id        Int         @id @default(autoincrement())
  tenantId  Int
  name      String
  slug      String
  isDefault Boolean     @default(false)
  status    StoreStatus @default(ACTIVE)
  createdAt DateTime    @default(now())
  updatedAt DateTime    @updatedAt
  tenant    Tenant      @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  @@unique([tenantId, slug])
  @@map("stores")
}

enum TenantStatus { ACTIVE SUSPENDED }
enum StoreStatus  { ACTIVE SUSPENDED }
```

- [ ] **Step 2: Add `tenantId` to each tenant-scoped model**

Add this field to `Product`, `Category`, `ProductVariant`, `ProductImage`, `VariantQuantityOption`, `VariantPriceBreak`, `Review`, `ReviewVote`, `StoreCreditTransaction`, `UiSetting`, `UserRole`:

```prisma
  tenantId Int
```

On `User` make it nullable-by-design (super-admins have null tenant):

```prisma
  tenantId Int?
```

Add `@@index([tenantId])` to each of these models.

- [ ] **Step 3: Add `storeId` to each store-scoped model**

Add to `Order`, `OrderItem`, `OrderStatusEvent`, `Payment`, `CartItem`, `PrintJob`, `PosOutbox`, `OrderPosMapping` (plus the `tenantId Int` line from Step 2):

```prisma
  storeId Int
```

Add `@@index([storeId])` to each.

For `Announcement` and `ContactMessage`, add `tenantId Int` (Step 2) and a **nullable** `storeId Int?` (null = tenant-wide broadcast):

```prisma
  storeId Int?
```

- [ ] **Step 4: Add `storeId` to `UserRole`**

```prisma
  storeId Int?
```

- [ ] **Step 5: Validate the schema**

Run: `cd backend && npx prisma validate`
Expected: "The schema at prisma/schema.prisma is valid 🚀"

- [ ] **Step 6: Commit**

```bash
git add backend/prisma/schema.prisma
git commit -m "feat(tenancy): add Tenant/Store models and scope columns to schema"
```

---

## Task 4: Core migration — tables, backfill, and composite unique indexes

**Files:**
- Create: `backend/prisma/migrations/<ts>_multitenancy_core/migration.sql`

**Interfaces:**
- Produces: DB tables `tenants`/`stores`; `tenant_id`/`store_id` columns with `NOT NULL` constraints; all existing data backfilled into the default tenant; tenant-scoped composite unique constraints.

- [ ] **Step 1: Generate the migration skeleton**

Run: `cd backend && npx prisma migrate dev --name multitenancy_core --create-only`
Expected: creates `prisma/migrations/<ts>_multitenancy_core/migration.sql` containing the DDL to create new tables, add columns (as `NOT NULL`), and build indexes. Do NOT apply yet.

- [ ] **Step 2: Modify `migration.sql` to backfill atomically before setting NOT NULL**

Because we have existing data (Choice A), adding required `NOT NULL` columns directly will fail. We must edit the generated file to split the addition of columns, run the backfill, set `NOT NULL`, drop global unique indexes, and add composite unique keys.

Modify the generated file to follow this execution sequence:

```sql
-- 1. Create Tenant and Store tables
-- (Use the Prisma-generated CREATE TABLE DDL for tenants and stores here)

-- 2. Add columns as NULLABLE initially so the database accepts them
ALTER TABLE products ADD COLUMN tenant_id INTEGER;
ALTER TABLE orders ADD COLUMN tenant_id INTEGER;
ALTER TABLE orders ADD COLUMN store_id INTEGER;
-- ... repeat for all other scoped tables ...

-- 3. Insert the Default Tenant + Default Store
INSERT INTO tenants (slug, name, status, "createdAt", "updatedAt")
VALUES ('app', 'Default Store', 'ACTIVE', now(), now())
ON CONFLICT (slug) DO NOTHING;

INSERT INTO stores (tenant_id, name, slug, "isDefault", status, "createdAt", "updatedAt")
SELECT t.id, 'Main', 'main', true, 'ACTIVE', now(), now()
FROM tenants t WHERE t.slug = 'app'
ON CONFLICT (tenant_id, slug) DO NOTHING;

-- 4. Backfill existing data to the Default Tenant / Store
UPDATE products SET tenant_id = (SELECT id FROM tenants WHERE slug='app') WHERE tenant_id IS NULL;
UPDATE categories SET tenant_id = (SELECT id FROM tenants WHERE slug='app') WHERE tenant_id IS NULL;
UPDATE users SET tenant_id = (SELECT id FROM tenants WHERE slug='app') WHERE tenant_id IS NULL;
-- ... repeat for all other tenant-scoped tables ...

UPDATE orders SET
  tenant_id = (SELECT id FROM tenants WHERE slug='app'),
  store_id  = (SELECT s.id FROM stores s JOIN tenants t ON s.tenant_id=t.id WHERE t.slug='app' AND s."isDefault")
WHERE tenant_id IS NULL OR store_id IS NULL;
-- ... repeat for other store-scoped tables: order_items, order_status_events, payments, cart_items, print_jobs, pos_outbox, order_pos_mappings ...

-- 5. Enforce NOT NULL now that every row is tagged
ALTER TABLE products ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE orders ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE orders ALTER COLUMN store_id SET NOT NULL;
-- ... repeat for all other scoped columns ...

-- 6. Drop global unique constraints and add composite unique constraints (Tenant-scoped)
-- Example for products slug:
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_slug_key;
ALTER TABLE products ADD CONSTRAINT products_tenant_id_slug_key UNIQUE (tenant_id, slug);

-- Example for categories slug:
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_slug_key;
ALTER TABLE categories ADD CONSTRAINT categories_tenant_id_slug_key UNIQUE (tenant_id, slug);

-- Example for users email and username:
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_key;
ALTER TABLE users ADD CONSTRAINT users_tenant_id_username_key UNIQUE (tenant_id, username);
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
ALTER TABLE users ADD CONSTRAINT users_tenant_id_email_key UNIQUE (tenant_id, email);

-- 7. Add Foreign Key constraints and Indexes
-- (Use the Prisma-generated ALTER TABLE ADD CONSTRAINT and CREATE INDEX DDL here, prefixing them with scope columns)
```

- [ ] **Step 3: Apply the migration**

Run: `cd backend && npx prisma migrate dev`
Expected: Migration applies atomically; DDL compiles; no errors.

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/migrations backend/generated/prisma
git commit -m "feat(tenancy): core migration with default tenant backfill and composite unique indexes"
```

---

## Task 5: Tenant-scoped Prisma client (Query filter extension)

**Files:**
- Modify: `backend/src/config/database.ts`
- Test: `backend/src/config/database.tenant.test.ts`

**Interfaces:**
- Consumes: `getTenantContext` (Task 1).
- Produces:
  - `getTenantPrisma(): PrismaClient` — returns an extended Prisma client that automatically appends `tenantId` (and `storeId` if applicable) to all read filters and write objects. Throws `MissingTenantContextError` if no context and the model is scoped.
  - `getUnscopedPrisma(): PrismaClient` — returns the base client without filters (used for migrations and background workers).
  - default export stays the base client for backward-compat during migration.

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/config/database.tenant.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTenantPrisma, getUnscopedPrisma } from './database';
import { runWithTenant } from './tenantContext';

// Integration test — requires a test Postgres with the migration applied.
describe('getTenantPrisma', () => {
  const base = getUnscopedPrisma();
  let tA: number, tB: number;

  beforeAll(async () => {
    const a = await base.tenant.create({ data: { slug: `a-${Date.now()}`, name: 'A' } });
    const b = await base.tenant.create({ data: { slug: `b-${Date.now()}`, name: 'B' } });
    tA = a.id; tB = b.id;
    // category requires tenant_id; insert via raw to set context-free
    await base.$executeRawUnsafe(
      `INSERT INTO categories (name, tenant_id, "createdAt", "updatedAt") VALUES ('catA', $1, now(), now())`, tA);
    await base.$executeRawUnsafe(
      `INSERT INTO categories (name, tenant_id, "createdAt", "updatedAt") VALUES ('catB', $1, now(), now())`, tB);
  });

  afterAll(async () => {
    await base.$executeRawUnsafe(`DELETE FROM categories WHERE tenant_id IN ($1,$2)`, tA, tB);
    await base.tenant.deleteMany({ where: { id: { in: [tA, tB] } } });
  });

  it('only sees rows for the active tenant', async () => {
    const seen = await runWithTenant({ tenantId: tA, storeId: null, scope: 'tenant' }, async () => {
      return getTenantPrisma().category.findMany();
    });
    expect(seen.every((c) => c.name === 'catA')).toBe(true);
    expect(seen.some((c) => c.name === 'catB')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/config/database.tenant.test.ts`
Expected: FAIL — `getTenantPrisma is not a function`.

- [ ] **Step 3: Implement the extension in `database.ts`**

Add below the existing singleton (keep the existing default export):

```ts
import { getTenantContext } from './tenantContext';
import { MissingTenantContextError } from './tenantContext';
import { isUnscoped, isStoreScoped } from './tenantScope';

export function getUnscopedPrisma() {
  return prisma;
}

// Cache one extended client per process; it reads ALS context per-operation.
let tenantClient: ReturnType<typeof buildTenantClient> | undefined;

function buildTenantClient() {
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const table = modelToTable(model);
          if (isUnscoped(table)) {
            return query(args);
          }

          const ctx = getTenantContext();
          if (!ctx) throw new MissingTenantContextError();

          // 1. Inject write scope
          if (operation === 'create') {
            args.data = args.data || {};
            args.data.tenantId = ctx.tenantId;
            if (ctx.storeId != null && isStoreScoped(table)) {
              args.data.storeId = ctx.storeId;
            }
          } else if (operation === 'createMany') {
            if (args.data) {
              const list = Array.isArray(args.data) ? args.data : [args.data];
              for (const item of list) {
                item.tenantId = ctx.tenantId;
                if (ctx.storeId != null && isStoreScoped(table)) {
                  item.storeId = ctx.storeId;
                }
              }
            }
          }

          // 2. Inject read/update/delete filters
          if (['findFirst', 'findMany', 'update', 'updateMany', 'delete', 'deleteMany', 'count', 'aggregate', 'groupBy'].includes(operation)) {
            args.where = args.where || {};
            args.where.tenantId = ctx.tenantId;
            if (ctx.storeId != null && isStoreScoped(table)) {
              args.where.storeId = ctx.storeId;
            }
          } else if (operation === 'findUnique') {
            // Map findUnique to findFirst to allow appending non-unique filters (tenantId) at runtime
            const newArgs = { ...args };
            newArgs.where = { ...newArgs.where, tenantId: ctx.tenantId };
            if (ctx.storeId != null && isStoreScoped(table)) {
              newArgs.where.storeId = ctx.storeId;
            }
            return (prisma as any)[model].findFirst(newArgs);
          }

          return query(args);
        },
      },
    },
  });
}

export function getTenantPrisma() {
  if (!tenantClient) tenantClient = buildTenantClient();
  return tenantClient;
}

// Prisma model name (PascalCase) -> @@map table name. Generated mapping.
function modelToTable(model: string): string {
  const map: Record<string, string> = {
    User: 'users', Product: 'products', Category: 'categories',
    ProductVariant: 'product_variants', ProductImage: 'product_images',
    VariantQuantityOption: 'variant_quantity_options', VariantPriceBreak: 'variant_price_breaks',
    Review: 'reviews', ReviewVote: 'review_votes',
    StoreCreditTransaction: 'store_credit_transactions', UiSetting: 'ui_settings',
    UserRole: 'user_roles', Order: 'orders', OrderItem: 'order_items',
    OrderStatusEvent: 'order_status_events', Payment: 'payments', CartItem: 'cart_items',
    PrintJob: 'print_jobs', PosOutbox: 'pos_outbox', OrderPosMapping: 'order_pos_mappings',
    Announcement: 'announcements', ContactMessage: 'contact_messages',
    Role: 'roles', RefreshToken: 'refresh_tokens', Tenant: 'tenants', Store: 'stores',
    AddressGeocodeCache: 'address_geocode_cache',
  };
  return map[model] ?? model.toLowerCase();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/config/database.tenant.test.ts`
Expected: PASS — tenant A sees only `catA`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/config/database.ts backend/src/config/database.tenant.test.ts
git commit -m "feat(tenancy): tenant-scoped Prisma client via query filtering extension"
```

---

## Task 5B: Scoping Raw SQL Queries

**Files:**
- Modify: `backend/src/services/printJob.service.ts`
- Modify: `backend/src/services/search/postgres.search.service.ts`

**Interfaces:**
- Consumes: `getTenantContext` (Task 1).
- Produces: Scopes print job claiming and product text searches to prevent cross-tenant data leaks in raw SQL queries.

- [ ] **Step 1: Inject scope filters in print job claiming**

In `backend/src/services/printJob.service.ts`'s `claimNextJob`, locate the raw SQL query and inject `"tenantId"` and `"storeId"` checks from the active tenant context:

```ts
    const ctx = getTenantContext();
    if (!ctx) throw new MissingTenantContextError();

    const rows = await prisma.$queryRaw<PrintJobRow[]>`
      UPDATE "print_jobs"
      SET
        "status" = 'CLAIMED'::"PrintJobStatus",
        "claimedByAgentId" = ${data.agentId},
        "claimedAt" = NOW(),
        "completedAt" = NULL,
        "failedAt" = NULL
      WHERE "id" = (
        SELECT "id"
        FROM "print_jobs"
        WHERE
          ("status" = 'PENDING'::"PrintJobStatus"
           OR (
             "status" = 'CLAIMED'::"PrintJobStatus"
             AND "claimedAt" < NOW() - INTERVAL '5 minutes'
           ))
          AND "tenantId" = ${ctx.tenantId}
          AND "storeId" = ${ctx.storeId}
        ORDER BY "createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING ...
```

- [ ] **Step 2: Inject scope filters in PostgreSQL product searches**

In `backend/src/services/search/postgres.search.service.ts`'s `searchProducts`, inject `"tenantId"` check into the `search_vector` query:

```ts
    const ctx = getTenantContext();
    if (!ctx) throw new MissingTenantContextError();

    const ranked = await prisma.$queryRaw<{ id: number }[]>`
      SELECT p."id"
      FROM "products" p
      WHERE p."search_vector" @@ plainto_tsquery('english', ${term})
        AND p."tenantId" = ${ctx.tenantId}
        ${!visibility.includeHidden ? Prisma.sql`AND p."hidden" = false` : Prisma.empty}
        ${!visibility.includeVipOnly ? Prisma.sql`AND p."vipOnly" = false` : Prisma.empty}
      ORDER BY ts_rank(p."search_vector", plainto_tsquery('english', ${term})) DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/printJob.service.ts backend/src/services/search/postgres.search.service.ts
git commit -m "feat(tenancy): scope raw SQL queries by tenant context"
```

---

## Task 6: Subdomain resolution middleware

**Files:**
- Create: `backend/src/middleware/tenant.middleware.ts`
- Modify: `backend/src/types/express.d.ts`
- Test: `backend/src/middleware/tenant.middleware.test.ts`

**Interfaces:**
- Consumes: `runWithTenant` (Task 1), `getUnscopedPrisma` (Task 5).
- Produces: `resolveTenant(req, res, next)` — extracts subdomain from `req.hostname`, looks up tenant by slug, sets `req.tenantId`/`req.tenant`/`req.store`, and runs the rest of the request inside `runWithTenant`. Unknown/suspended tenant → 404/403. Reserved `admin`/apex → super-admin scope.

- [ ] **Step 1: Add request typings**

```ts
// backend/src/types/express.d.ts — add inside the Express Request augmentation
    tenantId?: number | null;
    tenant?: { id: number; slug: string; status: string } | null;
    store?: { id: number } | null;
```

- [ ] **Step 2: Write the failing test**

```ts
// backend/src/middleware/tenant.middleware.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const findTenant = vi.fn();
const findStore = vi.fn();
vi.mock('../config/database', () => ({
  getUnscopedPrisma: () => ({
    tenant: { findUnique: findTenant },
    store: { findFirst: findStore },
  }),
}));

import { resolveTenant } from './tenant.middleware';

function mk(hostname: string) {
  const req: any = { hostname, headers: {} };
  const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  const next = vi.fn();
  return { req, res, next };
}

describe('resolveTenant', () => {
  beforeEach(() => { findTenant.mockReset(); findStore.mockReset(); });

  it('404s an unknown subdomain', async () => {
    findTenant.mockResolvedValue(null);
    const { req, res, next } = mk('nope.yourapp.com');
    await resolveTenant(req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });

  it('403s a suspended tenant', async () => {
    findTenant.mockResolvedValue({ id: 1, slug: 'acme', status: 'SUSPENDED' });
    const { req, res, next } = mk('acme.yourapp.com');
    await resolveTenant(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('resolves an active tenant and calls next inside context', async () => {
    findTenant.mockResolvedValue({ id: 1, slug: 'acme', status: 'ACTIVE' });
    findStore.mockResolvedValue({ id: 5 });
    const { req, res, next } = mk('acme.yourapp.com');
    await resolveTenant(req, res, next);
    expect(req.tenantId).toBe(1);
    expect(req.store.id).toBe(5);
    expect(next).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && npx vitest run src/middleware/tenant.middleware.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the middleware**

```ts
// backend/src/middleware/tenant.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { getUnscopedPrisma } from '../config/database';
import { runWithTenant } from '../config/tenantContext';

const ROOT_DOMAIN_LABELS = 2;

function subdomainOf(hostname: string): string {
  const labels = hostname.split('.');
  if (labels.length <= ROOT_DOMAIN_LABELS) return '';
  return labels[0];
}

export async function resolveTenant(req: Request, res: Response, next: NextFunction): Promise<void> {
  const host = req.hostname;
  const sub = subdomainOf(host);
  const prisma = getUnscopedPrisma();

  // 1. Super-admin Console Check
  if (sub === 'admin') {
    req.tenantId = null;
    req.tenant = null;
    req.store = null;
    runWithTenant({ tenantId: 0, storeId: null, scope: 'super-admin' }, () => next());
    return;
  }

  // 2. Resolve by custom domain OR subdomain (slug). Fallback to 'app' on apex/www.
  const lookupSlug = (sub && sub !== 'www') ? sub : 'app';
  let tenant = await prisma.tenant.findFirst({
    where: {
      OR: [
        { customDomain: host },
        { slug: lookupSlug }
      ]
    }
  });

  // 3. Fallback to default 'app' tenant if not found (helps with localhost dev testing)
  if (!tenant) {
    tenant = await prisma.tenant.findUnique({ where: { slug: 'app' } });
  }

  if (!tenant) {
    res.status(404).json({ error: 'Tenant configuration missing' });
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx vitest run src/middleware/tenant.middleware.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Mount it in `index.ts` before routes**

In `backend/src/index.ts`, after `app.use(cookieParser());` (line ~86) and before the `/api/*` route mounts, add:

```ts
import { resolveTenant } from './middleware/tenant.middleware';
// ...
app.use('/api', resolveTenant);
```

- [ ] **Step 7: Commit**

```bash
git add backend/src/middleware/tenant.middleware.ts backend/src/middleware/tenant.middleware.test.ts backend/src/types/express.d.ts backend/src/index.ts
git commit -m "feat(tenancy): subdomain tenant-resolution middleware"
```

---

## Task 7: Tenant-aware JWT + scoped roles

**Files:**
- Modify: `backend/src/utils/jwt.util.ts`
- Modify: `backend/src/services/auth.service.ts`
- Test: `backend/src/utils/jwt.util.test.ts` (extend if exists, else create)

**Interfaces:**
- Produces:
  - `JwtPayload` gains `tenantId: number | null` and `roles: Array<{ name: RoleName; storeId: number | null }>`.
  - `auth.service` login/refresh emit the new shape.

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/utils/jwt.util.test.ts
import { describe, it, expect } from 'vitest';
import { generateToken, verifyToken } from './jwt.util';

describe('tenant-aware JWT', () => {
  it('round-trips tenantId and scoped roles', () => {
    const token = generateToken({
      userId: 1, username: 'u', tenantId: 42,
      roles: [{ name: 'MANAGEMENT', storeId: 5 }],
    });
    const decoded = verifyToken(token);
    expect(decoded.tenantId).toBe(42);
    expect(decoded.roles).toEqual([{ name: 'MANAGEMENT', storeId: 5 }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/utils/jwt.util.test.ts`
Expected: FAIL — type error / `tenantId` missing.

- [ ] **Step 3: Update `JwtPayload`**

```ts
// backend/src/utils/jwt.util.ts — replace the interface
export interface JwtPayload {
  userId: number;
  username: string;
  tenantId: number | null;
  roles: Array<{ name: RoleName; storeId: number | null }>;
}
```

- [ ] **Step 4: Update `auth.service.ts` token emission**

In both `generateToken({...})` call sites (login ~line 185, refresh ~line 294), change `roles: roleNames` to the scoped shape and add `tenantId`. Add a helper near `toRoleNames`:

```ts
// returns scoped roles for the JWT
private toScopedRoles(
  rows: Array<{ role: { name: string }; storeId?: number | null }>,
): Array<{ name: RoleName; storeId: number | null }> {
  return rows
    .filter((r) => isRoleName(r.role.name))
    .map((r) => ({ name: r.role.name as RoleName, storeId: r.storeId ?? null }));
}
```

Then at each call site:

```ts
const token = generateToken({
  userId: user.id,
  username: user.username,
  tenantId: user.tenantId ?? null,
  roles: this.toScopedRoles(rolesWithNames),
});
```

> `getUserRolesWithNames` must also select `storeId`. Update its `include`/`select` in `userRoles.helper.ts` to return `storeId` on each `userRole` row.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx vitest run src/utils/jwt.util.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/utils/jwt.util.ts backend/src/services/auth.service.ts backend/src/services/userRoles.helper.ts backend/src/utils/jwt.util.test.ts
git commit -m "feat(tenancy): tenant-aware JWT with store-scoped roles"
```

---

## Task 8: Auth middleware tenant cross-check + store-aware roles

**Files:**
- Modify: `backend/src/middleware/auth.middleware.ts`
- Modify: `backend/src/middleware/role.middleware.ts`
- Test: `backend/src/middleware/auth.middleware.test.ts`, `role.middleware.test.ts` (extend)

**Interfaces:**
- Consumes: `req.tenantId` (Task 6), `JwtPayload.tenantId`/`roles` (Task 7).
- Produces: 401 when token tenant ≠ resolved tenant; role checks honor `storeId` scope.

- [ ] **Step 1: Write the failing test (cross-check)**

```ts
// add to backend/src/middleware/auth.middleware.test.ts
import { describe, it, expect, vi } from 'vitest';
import { authenticate } from './auth.middleware';
import * as jwt from '../utils/jwt.util';

it('rejects a token minted for another tenant', async () => {
  vi.spyOn(jwt, 'verifyToken').mockReturnValue({
    userId: 1, username: 'u', tenantId: 99, roles: [],
  } as any);
  const req: any = { headers: { authorization: 'Bearer x' }, tenantId: 1, path: '/', method: 'GET' };
  const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  const next = vi.fn();
  await authenticate(req, res, next);
  expect(res.status).toHaveBeenCalledWith(401);
  expect(next).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/middleware/auth.middleware.test.ts`
Expected: FAIL — current middleware calls `next()` regardless of tenant.

- [ ] **Step 3: Add the cross-check in `auth.middleware.ts`**

After `const decoded = verifyToken(token);` and before `req.user = decoded;`:

```ts
// Tenant binding: a token minted for tenant A must never authenticate on tenant B.
// Super-admin tokens (tenantId === null) are exempt and only valid on the admin context.
// Grace path: legacy tokens (missing tenantId) map strictly to the Default Tenant (ID = 1).
// If a legacy token is presented on a non-default subdomain, it is rejected.
const tokenTenantId = decoded.tenantId === undefined ? 1 : decoded.tenantId;

if (tokenTenantId !== null && tokenTenantId !== req.tenantId) {
  logger.warn('Authentication failed: tenant mismatch', {
    requestId: req.requestId || 'unknown',
    tokenTenant: decoded.tenantId,
    resolvedTenant: req.tenantId ?? null,
  });
  res.status(401).json({ error: 'Invalid or expired token' });
  return;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/middleware/auth.middleware.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing test (store-aware role)**

```ts
// add to backend/src/middleware/role.middleware.test.ts
it('accepts a tenant-wide role for any store and rejects a wrong-store role', async () => {
  const { requireRole } = await import('./role.middleware');
  const mw = requireRole(['MANAGEMENT']);

  // tenant-wide ADMIN passes
  const reqAdmin: any = { user: { roles: [{ name: 'ADMIN', storeId: null }] }, store: { id: 5 } };
  const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  const next1 = vi.fn(); mw(reqAdmin, res, next1); expect(next1).toHaveBeenCalled();

  // MANAGEMENT scoped to store 9 fails on store 5
  const reqMgr: any = { user: { roles: [{ name: 'MANAGEMENT', storeId: 9 }] }, store: { id: 5 } };
  const next2 = vi.fn(); mw(reqMgr, res, next2); expect(next2).not.toHaveBeenCalled();
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `cd backend && npx vitest run src/middleware/role.middleware.test.ts`
Expected: FAIL — current `requireRole` reads `roles` as `string[]`.

- [ ] **Step 7: Update `role.middleware.ts` to scoped roles**

Replace the role-matching logic so it accepts the scoped shape:

```ts
// roles is now Array<{ name: RoleName; storeId: number | null }>
export function requireRole(allowed: RoleName[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const roles = (req.user?.roles ?? []) as Array<{ name: string; storeId: number | null }>;
    const actingStore = req.store?.id ?? null;
    const ok = roles.some((r) =>
      allowed.includes(r.name as RoleName) &&
      (r.storeId === null || r.storeId === actingStore),
    );
    if (!ok) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}
```

- [ ] **Step 8: Run to verify it passes**

Run: `cd backend && npx vitest run src/middleware/role.middleware.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add backend/src/middleware/auth.middleware.ts backend/src/middleware/role.middleware.ts backend/src/middleware/auth.middleware.test.ts backend/src/middleware/role.middleware.test.ts
git commit -m "feat(tenancy): tenant cross-check + store-aware role authorization"
```

---

## Task 9: Verify migration and add composite unique indexes

**Files:**
- Modify: `backend/prisma/schema.prisma`

**Interfaces:**
- Produces: Composite unique constraints on scoped tables (e.g. `Product`, `Category`, `User`) leading with `tenantId` to prevent cross-tenant key collisions.

> Note: Because we are implementing multi-tenancy on shared tables, we must convert global unique constraints like `email` or `slug` into composite unique constraints scoped by tenant (`@@unique([tenantId, slug])`). This ensures Tenant A can create a product with the same slug as Tenant B without errors.

- [ ] **Step 1: Update unique fields in `schema.prisma` to composite unique keys**

In `backend/prisma/schema.prisma`, update the unique constraints for all scoped tables:
- On `Product`: replace `@unique` on `slug` with `@@unique([tenantId, slug])`.
- On `Category`: replace `@unique` on `slug` with `@@unique([tenantId, slug])`.
- On `User`: replace `@unique` on `username` and `email` with `@@unique([tenantId, username])` and `@@unique([tenantId, email])`.
- (Repeat for other scoped models with unique keys, ensuring they are prefixed with `tenantId`).

- [ ] **Step 2: Generate unique index migration**

Run: `cd backend && npx prisma migrate dev --name scoped_unique_constraints`
Expected: Migration generates the SQL to drop original single-column unique indexes and add composite unique constraints.

- [ ] **Step 3: Verify data integrity and index coverage**

Run:
```bash
npx prisma db execute --stdin <<'SQL'
SELECT count(*) AS orphan_products FROM products WHERE tenant_id IS NULL;
SELECT count(*) AS orphan_orders FROM orders WHERE tenant_id IS NULL OR store_id IS NULL;
SQL
```
Expected: both counts `0` (asserts the Task 4 backfill ran successfully).

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(tenancy): add tenant-scoped composite unique indexes and verify migration"
```
---

## Task 10: Startup default tenant verification

**Files:**
- Modify: `backend/src/index.ts`
- Create: `backend/src/config/verifyDefaultTenant.ts`
- Test: `backend/src/config/verifyDefaultTenant.test.ts`

**Interfaces:**
- Produces: `verifyDefaultTenant(prisma): Promise<void>` — queries database for the default tenant (`slug: 'app'`); throws if missing; called during boot before `app.listen`.

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/config/verifyDefaultTenant.test.ts
import { describe, it, expect, vi } from 'vitest';
import { verifyDefaultTenant } from './verifyDefaultTenant';

it('throws when default tenant is missing', async () => {
  const prisma: any = { tenant: { findUnique: vi.fn().mockResolvedValue(null) } };
  await expect(verifyDefaultTenant(prisma)).rejects.toThrow(/default tenant/i);
});

it('passes when default tenant exists', async () => {
  const prisma: any = { tenant: { findUnique: vi.fn().mockResolvedValue({ id: 1, slug: 'app' }) } };
  await expect(verifyDefaultTenant(prisma)).resolves.toBeUndefined();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npx vitest run src/config/verifyDefaultTenant.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// backend/src/config/verifyDefaultTenant.ts
export async function verifyDefaultTenant(prisma: {
  tenant: { findUnique: (args: any) => Promise<any> };
}): Promise<void> {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: 'app' },
  });
  if (!tenant) {
    throw new Error(
      'FATAL: Default tenant (slug: app) is missing from the database. Ensure database migrations have run.',
    );
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && npx vitest run src/config/verifyDefaultTenant.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire into boot in `index.ts`**

Where the server starts (near `app.listen`), gate it (skip in test env):

```ts
import { verifyDefaultTenant } from './config/verifyDefaultTenant';
import { getUnscopedPrisma } from './config/database';
// ...
if (process.env.NODE_ENV !== 'test') {
  await verifyDefaultTenant(getUnscopedPrisma());
}
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/config/verifyDefaultTenant.ts backend/src/config/verifyDefaultTenant.test.ts backend/src/index.ts
git commit -m "feat(tenancy): verify default tenant exists on server boot"
```

---

## Task 11: Background workers enter tenant context

**Files:**
- Modify: `backend/src/services/pos/orders/outboxWorker.ts`
- Modify: `backend/src/services/printJob.service.ts`
- Test: `backend/src/services/pos/orders/outboxWorker.tenant.test.ts`

**Interfaces:**
- Consumes: `runWithTenant` (Task 1), row `tenantId`/`storeId`.
- Produces: each per-row unit of work runs inside `runWithTenant`.

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/services/pos/orders/outboxWorker.tenant.test.ts
import { describe, it, expect, vi } from 'vitest';
import { getTenantContext } from '../../../config/tenantContext';
import { processOutboxRow } from './outboxWorker';

it('runs row processing inside that row tenant context', async () => {
  let seenTenant: number | undefined;
  const handler = vi.fn(async () => { seenTenant = getTenantContext()?.tenantId; });
  await processOutboxRow({ id: 1, tenantId: 77, storeId: 3 } as any, handler);
  expect(seenTenant).toBe(77);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npx vitest run src/services/pos/orders/outboxWorker.tenant.test.ts`
Expected: FAIL — `processOutboxRow` not exported / no context wrapping.

- [ ] **Step 3: Refactor the worker to wrap per-row work**

Extract the per-row body into an exported `processOutboxRow(row, handler)` that wraps the handler:

```ts
import { runWithTenant } from '../../../config/tenantContext';

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

Then call `processOutboxRow(row, () => /* existing per-row logic */)` from the poll loop. Note that the worker's polling query that retrieves these pending rows must be executed using the unscoped database client (`getUnscopedPrisma()`) so that no tenant filters are applied when reading items globally across all tenants. Once rows are retrieved, process each row individually inside the `processOutboxRow` helper. Apply the same pattern to the `printJob.service.ts` claim/process loop.

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && npx vitest run src/services/pos/orders/outboxWorker.tenant.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/pos/orders/outboxWorker.ts backend/src/services/printJob.service.ts backend/src/services/pos/orders/outboxWorker.tenant.test.ts
git commit -m "feat(tenancy): background workers run per-row in tenant context"
```

---

## Task 12: CI guardrail — Schema scope coverage

**Files:**
- Create: `backend/src/integration/schemaScope.test.ts`

**Interfaces:**
- Consumes: `UNSCOPED_TABLES` (from `tenantScope.ts`).

- [ ] **Step 1: Write the test (this IS the deliverable)**

```ts
// backend/src/integration/schemaScope.test.ts
import { describe, it, expect } from 'vitest';
import { Prisma } from '../generated/prisma';
import { UNSCOPED_TABLES } from '../config/tenantScope';

describe('Schema scope coverage (CI guardrail #1)', () => {
  it('every database model has a tenantId column except the unscoped allowlist', () => {
    const models = Prisma.dmmf.datamodel.models;
    const missing = models
      .filter((m) => !UNSCOPED_TABLES.has(m.dbName || m.name.toLowerCase()))
      .filter((m) => !m.fields.some((f) => f.name === 'tenantId'))
      .map((m) => m.name);
    expect(missing, `models missing tenantId: ${missing.join(', ')}`).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test**

Run: `cd backend && npx vitest run src/integration/schemaScope.test.ts`
Expected: PASS. If it lists models, they are missing the `tenantId` property in `schema.prisma`.

- [ ] **Step 3: Commit**

```bash
git add backend/src/integration/schemaScope.test.ts
git commit -m "test(tenancy): CI guardrail for schema scope coverage"
```

---

## Task 13: CI guardrail — cross-tenant leak integration

**Files:**
- Create: `backend/src/integration/tenantIsolation.test.ts`

- [ ] **Step 1: Write the test (the deliverable)**

```ts
// backend/src/integration/tenantIsolation.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getUnscopedPrisma, getTenantPrisma } from '../config/database';
import { runWithTenant } from '../config/tenantContext';

const base = getUnscopedPrisma();
let tA: number, tB: number, catB: number;

beforeAll(async () => {
  const a = await base.tenant.create({ data: { slug: `iso-a-${Date.now()}`, name: 'A' } });
  const b = await base.tenant.create({ data: { slug: `iso-b-${Date.now()}`, name: 'B' } });
  tA = a.id; tB = b.id;
  const rows = await base.$queryRawUnsafe<Array<{ id: number }>>(
    `INSERT INTO categories (name, tenant_id, "createdAt", "updatedAt")
     VALUES ('secretB', $1, now(), now()) RETURNING id`, tB);
  catB = rows[0].id;
});

afterAll(async () => {
  await base.$executeRawUnsafe(`DELETE FROM categories WHERE tenant_id IN ($1,$2)`, tA, tB);
  await base.tenant.deleteMany({ where: { id: { in: [tA, tB] } } });
});

describe('cross-tenant isolation (CI guardrail #2)', () => {
  it('tenant A cannot read tenant B rows via the ORM', async () => {
    const seen = await runWithTenant({ tenantId: tA, storeId: null, scope: 'tenant' }, () =>
      getTenantPrisma().category.findMany());
    expect(seen.find((c) => c.id === catB)).toBeUndefined();
  });

  it('tenant A cannot UPDATE tenant B rows (affects zero rows)', async () => {
    const affected = await runWithTenant({ tenantId: tA, storeId: null, scope: 'tenant' }, () =>
      getTenantPrisma().category.updateMany({ where: { id: catB }, data: { name: 'hacked' } }));
    expect(affected.count).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test**

Run: `cd backend && npx vitest run src/integration/tenantIsolation.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/src/integration/tenantIsolation.test.ts
git commit -m "test(tenancy): CI guardrail for cross-tenant leakage ORM integration"
```

---

## Task 14: Demo tenant seed

**Files:**
- Create: `backend/prisma/seed-demo.ts`
- Modify: `backend/package.json` (add `prisma:seed:demo` script)

**Interfaces:**
- Consumes: `getUnscopedPrisma` (seed runs unscoped, sets tenant explicitly).

- [ ] **Step 1: Write the seed (idempotent)**

```ts
// backend/prisma/seed-demo.ts
import { PrismaClient, OrderStatus } from '../generated/prisma';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient({ log: ['error'] });

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo' },
    update: {},
    create: { slug: 'demo', name: 'Demo Smoke Shop', status: 'ACTIVE' },
  });
  const store = await prisma.store.upsert({
    where: { tenantId_slug: { tenantId: tenant.id, slug: 'main' } },
    update: {},
    create: { tenantId: tenant.id, name: 'Demo Store', slug: 'main', isDefault: true, status: 'ACTIVE' },
  });

  // Fake catalog
  const cat = await prisma.category.create({
    data: { name: 'Demo Glassware', tenantId: tenant.id },
  });
  const product = await prisma.product.create({
    data: {
      name: 'Sample Demo Product', slug: `demo-product-${tenant.id}`,
      categoryId: cat.id, tenantId: tenant.id,
      variants: {
        create: [{ label: 'Standard', sku: `DEMO-${tenant.id}-1`, basePrice: 9.99,
          isDefault: true, tenantId: tenant.id }],
      },
    },
    include: { variants: true },
  });

  // Demo users
  const pwd = await bcrypt.hash('demo1234', 10);
  const mgmtRole = await prisma.role.findUnique({ where: { name: 'MANAGEMENT' } });
  const custRole = await prisma.role.findUnique({ where: { name: 'CUSTOMER' } });
  const manager = await prisma.user.create({
    data: { username: 'demo-manager', password: pwd, approved: true, tenantId: tenant.id,
      userRoles: { create: [{ roleId: mgmtRole!.id, storeId: store.id }] } },
  });
  const customer = await prisma.user.create({
    data: { username: 'demo-customer', password: pwd, approved: true, tenantId: tenant.id,
      userRoles: { create: [{ roleId: custRole!.id, storeId: null }] } },
  });

  // One order per stage
  const stages: OrderStatus[] = [
    'PENDING', 'APPROVED', 'READY_FOR_DELIVERY', 'OUT_FOR_DELIVERY',
    'DELIVERED', 'READY_FOR_PICKUP', 'PICKED_UP',
  ];
  for (const status of stages) {
    await prisma.order.create({
      data: {
        userId: customer.id, status, total: 9.99, subtotal: 9.99,
        tenantId: tenant.id, storeId: store.id,
        items: { create: [{ variantId: product.variants[0].id, productName: product.name,
          variantLabel: 'Standard', quantity: 1, unitPrice: 9.99 }] },
      },
    });
  }
  console.log(`✅ Demo tenant seeded: ${tenant.slug} (manager=demo-manager / demo1234)`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Add the script**

In `backend/package.json` scripts: `"prisma:seed:demo": "ts-node prisma/seed-demo.ts"`.

- [ ] **Step 3: Run the seed**

Run: `cd backend && npm run prisma:seed:demo`
Expected: logs `✅ Demo tenant seeded`. Re-running does not duplicate the tenant/store (upsert) — note product/order creates are additive; acceptable for a refreshable demo.

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/seed-demo.ts backend/package.json
git commit -m "feat(tenancy): seed Demo tenant with fake catalog and staged orders"
```

---

## Task 15: Full suite + typecheck green

**Files:** none (verification task).

- [ ] **Step 1: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors. Fix any fallout from the `JwtPayload`/roles shape change in controllers/services that read `req.user.roles` as `string[]` — update them to read `r.name`.

- [ ] **Step 2: Full test run**

Run: `cd backend && npx vitest run`
Expected: all suites pass. Existing tests that construct `JwtPayload` or call `requireRole` may need their fixtures updated to the scoped-roles shape.

- [ ] **Step 3: Commit any fixups**

```bash
git add -A
git commit -m "chore(tenancy): align callers with scoped-roles JWT shape; suite green"
```

---

## Self-Review Notes (coverage vs spec)

- New entities (Tenant/Store) → Tasks 3, 4.
- Scope columns on all tables → Tasks 3, 4; backfill + NOT NULL → Task 4; unique constraints → Task 4.
- ORM-first isolation (Prisma Client Extension, ALS hook) → Tasks 1, 2, 4, 5, 10.
- Subdomain resolution → Task 6.
- Tenant-aware JWT + scoped roles → Task 7; cross-check + store-aware auth → Task 8.
- Background-worker context → Task 11.
- Demo seed → Task 14.
- CI guardrails #1/#2 (required) → Tasks 12, 13. (Linter checks and unscoped-allowlist audits are recommended fast-follows, not blocking Phase 1.)
- Frontend impact is minimal/no-code (server-side resolution) per spec; DNS/TLS is an infra task tracked outside this code plan.
