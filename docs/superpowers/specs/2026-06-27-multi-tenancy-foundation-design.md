# Multi-Tenancy Foundation (Phase 1) — Design

**Date:** 2026-06-27
**Status:** Approved design, ready for implementation plan
**Author:** Bilal + Claude

## Background & Goal

The app is currently single-tenant: one smoke shop, one global catalog, one set of
users, no notion of a "store" or "business" boundary anywhere in the schema. The
immediate trigger was a desire for a **public demo account** on the prod deployment —
a sandbox where people can explore both the customer shopping flow and the staff
(Management) order dashboard, populated with fake products and orders in various
stages, fully isolated from real data.

Rather than build a one-off demo hack, we are building a **full multi-tenancy
foundation** with a `Tenant → Store → Users/Orders` hierarchy. The Demo then becomes
simply a tenant with one store — the demo goal is delivered as a natural consequence
of the foundation, and the same machinery later supports onboarding real outside
businesses (white-label SaaS).

This document specifies **Phase 1: the foundation that also ships the demo.** Later
phases (store mechanics, super-admin console) get their own specs.

## Research basis (why this design)

Medusa — the reference open-source commerce platform — deliberately does **not** ship
multi-tenancy natively; it stays a tenant-agnostic engine and pushes tenancy
governance (provisioning, super-admin, billing, routing) into an external
orchestration layer, offering three isolation shapes: shared-infra multi-store,
database-per-tenant, and a hybrid. Their "Store + Sales Channels" concept maps to our
**Tenant → Store** split, not to tenant isolation itself.

The field-proven way to do *shared-database* tenant isolation (incl. the Medusa
community RLS guide) is **Postgres Row-Level Security as the primary, authoritative
enforcement**, with **AsyncLocalStorage (ALS)** carrying the tenant id to a DB
connection hook that sets a session variable. Business logic needs **zero** changes,
and isolation cannot be bypassed by a forgotten `where` clause. We adopt this directly.

## Conceptual Model (decisions made)

- **Hierarchy:** `Tenant` (the owning business) → `Store` (a storefront/location) →
  Users, Orders. A tenant may have many stores; Phase 1 ships each tenant with one
  default store.
- **Catalog:** tenant-level master catalog **+ per-store overrides** (override layer is
  Phase 2; Phase 1 ships the tenant-level master catalog only).
- **Customers:** tenant-level — one customer account shops any store within the tenant.
  Orders are still tied to a specific store. (`approved` becomes per-tenant for free,
  since customers are tenant-scoped user rows.)
- **Website/branding settings (`UiSetting`):** tenant-level. No per-store override in
  Phase 1.
- **Tenant resolution:** subdomain → tenant (`acme.yourapp.com` → tenant Acme). Store is
  selected *inside* the app (location picker — Phase 2), not in the URL, so the auth
  cookie and customer account span all of a tenant's stores.
- **Platform administration:** a super-admin console (later phase). Phase 1 creates
  tenants via seed/CLI.
- **Isolation strategy:** **Postgres Row-Level Security (RLS) is the primary mechanism,
  enabled in Phase 1.** ALS carries `{ tenantId, storeId }` per request; a DB hook sets
  the Postgres session variable; RLS policies filter every query in the database. The
  app's business logic is unchanged. An optional Prisma `where`-injection extension may
  be added purely for friendlier in-app dev errors, but it is **not** load-bearing.
- **Roles:** **global role catalog + scoped assignment.** Role *names* are fixed
  platform-wide; scope comes from `User.tenantId` and `UserRole.storeId`. No per-tenant
  custom roles (deferred indefinitely).

## Scope of Phase 1

In scope:

1. New core entities: `Tenant`, `Store`.
2. Add `tenantId` / `storeId` columns across all existing tenant/store tables.
3. Data migration wrapping existing data into a **default tenant + default store**.
4. **RLS isolation**: non-superuser application DB role, per-table RLS policies, ALS
   context + connection hook that sets the tenant session variable, auto-tagging column
   defaults.
5. Subdomain → tenant resolution middleware.
6. Tenant-aware JWT (`tenantId` + scoped roles in token, cross-checked against resolved
   subdomain).
7. User ↔ Store ↔ Role model (`User.tenantId`, `UserRole.storeId`) + store-aware
   authorization middleware.
8. Seed the **Demo tenant** (fake catalog + orders across all stages, a Management demo
   user, a customer demo user).
9. **CI guardrails** for tenant isolation (see CI Guardrails section): required checks
   #1 (RLS-on-every-scoped-table), #2 (cross-tenant leak test, incl. raw SQL), #3
   (non-superuser app role).

Out of scope (later phases):

- Per-store catalog overrides / per-store stock (`StoreVariantOverride`) — Phase 2.
- Location picker / store-switching UX — Phase 2.
- Staff multi-store assignment UI — Phase 2.
- Super-admin console UI, self-service tenant signup — Phase 3+.

## New Entities

```
Tenant
  id          Int      @id @default(autoincrement())
  slug        String   @unique   // maps to subdomain
  name        String
  status      TenantStatus @default(ACTIVE)   // ACTIVE | SUSPENDED
  plan        String?
  createdAt / updatedAt

Store
  id          Int      @id @default(autoincrement())
  tenantId    Int
  name        String
  slug        String
  isDefault   Boolean  @default(false)
  status      StoreStatus @default(ACTIVE)
  // operational fields kept minimal in Phase 1: address, hours, deliveryZone,
  // printerConfig migrated from existing global settings where applicable
  createdAt / updatedAt
  @@unique([tenantId, slug])
```

`enum TenantStatus { ACTIVE SUSPENDED }`
`enum StoreStatus { ACTIVE SUSPENDED }`

Super-admin is **not** a new table: a `User` with `tenantId = null` holding a
platform-level `SUPER_ADMIN` role. It is the only user type that lives above tenants.

## Scoping Map (existing tables)

**Tenant-scoped — add `tenantId`:**
`User`, `Product`, `Category`, `ProductVariant`, `ProductImage`,
`VariantQuantityOption`, `VariantPriceBreak`, `Review`, `ReviewVote`,
`StoreCreditTransaction`, `UiSetting`, `UserRole`.

**Store-scoped — add `storeId` (and `tenantId`):**
`Order`, `OrderItem`, `OrderStatusEvent`, `Payment`, `CartItem`, `PrintJob`,
`PosOutbox`, `OrderPosMapping`.

**Judgment calls (approved):**
- `Announcement` → store-scoped with a tenant-wide flag (`storeId` nullable; null =
  broadcast to all of the tenant's stores).
- `ContactMessage` → store-scoped.
- **Stock** stays on `ProductVariant` (tenant-level) in Phase 1; relocates to the
  per-store override table in Phase 2.

**Not scoped (global infrastructure, no RLS):**
`Role` (global role-name catalog), `AddressGeocodeCache` (shared geocoding cache),
`Tenant`/`Store` (the tenancy tables themselves), `RefreshToken` (scoped transitively
through its `User`; revisit if direct queries need protection).

## Isolation: RLS-first (the security core)

**1. Non-superuser application role.** RLS is *silently bypassed for Postgres
superusers*. The app must connect as a dedicated **non-superuser** role
(e.g. `app_user`) owning no `BYPASSRLS`. A startup assertion verifies
`SELECT usesuper FROM pg_user WHERE usename = current_user` is false and fails fast
otherwise. (Today's `DATABASE_URL` user is likely the superuser — creating and
switching to `app_user` is a Phase 1 migration task.)

**2. Tenant-tagged columns with automatic injection.** Each scoped table gets a standard required `tenantId` (store tables also `storeId`) with **no database-level default** in `schema.prisma`. Instead, a **Prisma Client Extension** intercepts all write operations (`create`/`createMany`) and automatically injects the `tenantId`/`storeId` from the `AsyncLocalStorage` context. Any write that bypasses the extension will fail-closed with a `NOT NULL` database constraint violation.

**3. RLS policies per table with bypass capability.** Enable RLS and add policies (SELECT/INSERT/UPDATE/DELETE) keyed on the session variable, with an escape hatch for super-admin/unscoped bypass:
```sql
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON products
  USING (
    (current_setting('app.bypass_rls', true) = 'true') OR
    (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::int)
  )
  WITH CHECK (
    (current_setting('app.bypass_rls', true) = 'true') OR
    (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::int)
  );
```
Store-scoped tables additionally constrain `store_id` (except announcements/messages which allow null `store_id`). A documented **"super-admin mode"** (setting `app.bypass_rls = 'true'`) is permitted only for the explicit unscoped/super-admin connection path, never for tenant requests.

**4. ALS context + connection hook.** `src/config/tenantContext.ts` exposes an `AsyncLocalStorage<{ tenantId, storeId, scope }>`. Middleware wraps each request in it. A Prisma client extension runs `SELECT set_config('app.current_tenant', $tenantId, true)` and `SELECT set_config('app.bypass_rls', 'false', true)` (or `'true'` for super-admin scope) before queries inside a transaction. This ensures connection-pool safety.

**5. Background workers** (outbox worker, print job poller, POS order service — `src/services/pos/orders/outboxWorker.ts`, `posOrderService.ts`, `printJob.service.ts`, `thermalPrinter.service.ts`) run outside requests. Their global poll queries (e.g., fetching pending outbox records) run in Super-Admin mode (bypassing RLS with `app.bypass_rls = 'true'`) to fetch entries across all tenants. Once rows are retrieved, processing loops enter the specific ALS tenant context (`tenantId`/`storeId`) for the respective row's data execution. Processing queries must never run without a tenant context.

**6. Explicit escape hatch.** `getUnscopedPrisma()` (or a connection that sets the session var empty) is the only sanctioned way to query across tenants — for migrations, the super-admin console, and platform ops. Grep-able and reviewed.

**7. Optional ergonomic extension (non-load-bearing).** We may add a Prisma `where`-injection extension so a developer who forgets context gets a clear error instead of an empty result. Isolation correctness does **not** depend on it — RLS is authoritative.

## Tenant-Aware JWT & Roles

`JwtPayload` gains `tenantId: number | null` and **scoped roles**:
`roles: Array<{ name: RoleName; storeId: number | null }>`.

- Subdomain middleware resolves `req.tenantId`; auth middleware cross-checks token
  `tenantId` **must equal** it (else 401) — a token for tenant A never authenticates
  against tenant B. Super-admin tokens (`tenantId=null`) are valid only on the admin
  context.
- **Role scopes:** platform (`SUPER_ADMIN`, `tenantId=null`), tenant
  (`ADMIN`/Owner, `CUSTOMER`, `VIP`; `storeId=null`), store
  (`MANAGEMENT`, `EMPLOYEE`, `DELIVERY_DRIVER`; `storeId` set).
- **Store-aware authorization:** `role.middleware.ts` changes from "has role name X" to
  "has role name X for the store this request targets." A tenant-wide role
  (`storeId=null`, e.g. ADMIN) satisfies any store; a store-scoped role matches only its
  store. The acting store comes from request context (Phase 1: the tenant's single default store).
- `SUPER_ADMIN` is added to `ROLE_NAMES`. The role *catalog* stays global; only
  assignment is scoped (via `User.tenantId` + `UserRole.storeId`).

## Tenant Lifecycle, Media, and Cookies

- **Soft-Delete Lifecycle:** Tenant deletion/suspension changes the status field (e.g. `TenantStatus.SUSPENDED` or a new `DELETED` state) on the `Tenant` table, cutting off access at the resolver middleware. We preserve historical data in the database rather than running cascaded hard deletes.
- **Media & Asset Isolation:** Product images, store banners, and user logos are uploaded to isolated file paths (e.g., `uploads/tenants/:tenantId/` or S3 folder prefixes `tenants/:tenantId/`) to prevent cross-tenant directory traversals and namespace collisions.

## Frontend Impact (Phase 1, minimal)

- API base stays `/api`; the browser sends the correct `Host` subdomain, so tenant resolution is server-side — no per-request tenant param.
- **Auth/Session Cookie Domain Scope:** Authentication cookies are scoped strictly to the host subdomain (e.g., `tenant.yourapp.com`), not the apex domain (`.yourapp.com`), preventing session conflicts when using multiple tenants.
- No location picker yet (single default store per tenant).
- Deployment: wildcard DNS (`*.yourapp.com`) + wildcard TLS so `demo.` and the real tenant subdomain resolve. (Infra task in the plan.)

## Data Migration (wrapping existing data)

Executed atomically in a single core migration file:

1. Create `Tenant`/`Store` tables and `TenantStatus`/`StoreStatus` enums.
2. Create the non-superuser `app_user` role; grant public schema privileges (no `BYPASSRLS`).
3. Add `tenantId`/`storeId` columns to existing scoped tables as **nullable** (`INTEGER`).
4. Insert the **default tenant** (the real smoke shop; slug = production subdomain) and its **default store** (`isDefault=true`).
5. Backfill every existing row's `tenantId` = default tenant; store-scoped rows' `storeId` = default store.
6. Alter all scoped columns to **NOT NULL**.
7. Drop global unique constraints on `slug`, `email`, and `username`, and add tenant-scoped composite unique constraints (e.g. `@@unique([tenantId, slug])`).
8. Add Foreign Keys + composite indexes leading with `tenantId`/`storeId` on hot paths.
9. Enable RLS and apply policies on all scoped tables, including the `app.bypass_rls` super-admin check.
10. Switch the app's runtime `DATABASE_URL` to `app_user`.

The database changes are safe and atomic, meaning columns are created, backfilled, and locked down all within the same transaction before any queries hit them.

### Indexing

Composite indexes lead with the scope key:
`Order @@index([storeId, status])`, `@@index([storeId, createdAt])`,
`Product @@index([tenantId, categoryId])`, etc.

## Demo Tenant Seed

Extends the `seed-prod.ts` pattern; idempotent and re-runnable (safe to refresh in
prod):

- A `Tenant` slug `demo` (→ `demo.yourapp.com`) + one default `Store`.
- A **fake catalog**: categories, products, variants with obviously-fake names/prices
  and placeholder images.
- **Orders across all stages**: at least one per meaningful `OrderStatus` (PENDING,
  APPROVED, READY_FOR_DELIVERY, OUT_FOR_DELIVERY, DELIVERED, READY_FOR_PICKUP,
  PICKED_UP, …) with items, status events, and payment rows, so the staff dashboard
  looks live.
- A **Management demo user** (store-scoped MANAGEMENT) and a **customer demo user**
  (tenant-scoped CUSTOMER), both pre-approved, with known credentials.

Demo safety is provided by tenant isolation alone in Phase 1 (it simply cannot see or
touch real data). A nightly reseed/reset can be added later if interactive mutations
prove undesirable.

## Frontend Impact (Phase 1, minimal)

- API base stays `/api`; the browser sends the correct `Host` subdomain, so tenant
  resolution is server-side — no per-request tenant param.
- Auth/session works per-subdomain (cookie scoped to the tenant subdomain).
- No location picker yet (single default store per tenant).
- Deployment: wildcard DNS (`*.yourapp.com`) + wildcard TLS so `demo.` and the real
  tenant subdomain resolve. (Infra task in the plan.)

## Testing Strategy

- **Isolation (the priority):** two tenants seeded; assert tenant A's API can never
  read/modify tenant B's products/orders/users **at the DB level** (RLS), including via
  raw queries; super-admin/unscoped path can; pooled-connection reuse never leaks
  context; startup fails if connected as superuser.
- **Resolution/auth:** host→tenant mapping; unknown/suspended tenant rejected; JWT
  tenant mismatch rejected; store-aware role checks (tenant-wide vs store-scoped).
- **Migration:** run against a snapshot of single-tenant data; all rows acquire the
  default tenant/store; app behaves identically; `app_user` has no BYPASSRLS.
- Existing service/controller suites run under a tenant context.

## CI Guardrails

Tenant-isolation failures are *silent* (a leak, not an error), so they will not surface
in manual testing. These automated checks make a regression turn the build red. They are
designed to **fail safe**: a newly added table is unprotected until explicitly
classified, so the build breaks rather than the data leaking. Tests that read Postgres's
own catalogs (`pg_tables`, `pg_policies`, `pg_user`) verify the *database's* actual
enforcement state, where a leak would originate.

**Required in Phase 1 (the catastrophic cases):**

1. **Every scoped table has RLS enabled.** Query `pg_tables` for `rowsecurity = false`
   minus an explicit UNSCOPED allowlist (`roles`, `address_geocode_cache`, `tenants`,
   `stores`, `refresh_tokens`). A new table is RLS-off by default → fails until
   classified.
2. **Cross-tenant leak integration test.** Seed two tenants; under tenant A's context
   assert reads return only A's rows and a write targeting B's id affects zero rows —
   **including via `$queryRaw`** (proves RLS, not just app filtering).
3. **App connects as a non-superuser.** Assert `usesuper = false` and no `BYPASSRLS`
   (superuser silently disables RLS). Mirrored as a runtime startup assertion.

**Strongly recommended (add in Phase 1 if cheap, else fast-follow):**

4. **Every scoped table has all four policies** (SELECT/INSERT/UPDATE/DELETE) via
   `pg_policies` — RLS enabled with no policy is a misconfiguration.
5. **Scope columns are injected on write by Prisma Client Extension** (query hook check) — so Prisma automatically injects the tenant ID on writes and the database fails-closed if bypassed.
6. **Pooled-connection context-reset test** — two sequential requests for different tenants forced onto the same connection; request 2 must not see request 1's context.
7. **Unscoped-access allowlist** — `getUnscopedPrisma()` may only be imported in approved files (migrations, super-admin, worker bootstrap); a new call site fails until reviewed.

**Nice-to-have hardening:** background-worker context test (worker with no context throws, not leaks); JWT cross-tenant rejection test (token for A on B's subdomain → 401).

## Risks & Open Items

- **Pervasive `tenantId`** touches ~25 tables — but with RLS-first, *service code is unchanged*; risk concentrates in the migration and the connection hook.
- **Superuser footgun:** must run as `app_user`; enforced by startup assertion + test.
- **Connection pooling:** session var must be transaction-local (or per-acquire + WeakMap). When a pooler (PgBouncer) is later added it must run in **transaction mode**.
- **Raw queries / nested writes** are now covered by RLS (the previous gap is closed).
- **Subdomain/DNS/TLS** infra is a prerequisite for the demo to be reachable in prod.
- **Prisma Client Extension vs. DB defaults.** To avoid Prisma CLI migration drift, we do not use `dbgenerated(...)` in schema.prisma. Instead, a Prisma client extension intercepts `create` and `createMany` queries to inject `tenantId`/`storeId`. The database columns are standard `NOT NULL` fields, which ensures any queries bypassing the client fail-closed in the database.
- **Transaction-local config constrains query execution (decide in implementation).** `set_config('app.current_tenant', …, true)` is transaction-local, so it only persists for queries inside an explicit transaction. Two viable paths: (a) run each request's DB work inside one interactive `$transaction`, or (b) use session-level config (`false`) + reset-on-connection-release guarded by a per-connection WeakMap (the approach used by the Medusa/Rigby implementation). Path (a) is cleaner but forces a one-transaction-per-request shape; path (b) avoids that but must guarantee reset on release. Pick one early — it shapes the connection hook and pooling story.
- **JWT payload shape change needs a grace path.** Tokens move from `roles: RoleName[]` to `tenantId` + scoped `roles: { name, storeId }[]`. Access tokens issued before deploy won't carry the new fields. To prevent user disruption, a brief tolerance window treats tokens missing a `tenantId` as mapped **strictly to the default tenant**. If a legacy token is presented on a non-default tenant subdomain, it must be rejected (401).

## Phasing (recap)

1. **Phase 1 (this spec)** — Foundation + Demo, RLS-first isolation.
2. **Phase 2** — Location picker, `StoreVariantOverride` (per-store price/stock/
   visibility, stock relocation), staff store-assignment, store-scoped dashboards.
3. **Phase 3** — Super-admin console; later, self-service tenant signup.
