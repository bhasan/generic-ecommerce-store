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

**2. Tenant-tagged columns with auto-populating defaults.** Each scoped table gets a
`tenantId` (store tables also `storeId`) with a DB `DEFAULT` derived from the session
variable, so inserts auto-tag at the database layer:
```
tenantId  ... DEFAULT NULLIF(current_setting('app.current_tenant', true), '')::int
```

**3. RLS policies per table.** Enable RLS and add policies (SELECT/INSERT/UPDATE/DELETE)
keyed on the session variable:
```sql
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON products
  USING (tenant_id = current_setting('app.current_tenant')::int)
  WITH CHECK (tenant_id = current_setting('app.current_tenant')::int);
```
Store-scoped tables additionally constrain `store_id`. A documented **"admin mode"**
(session var empty/NULL) is permitted *only* for the explicit unscoped/super-admin
connection path, never for tenant requests.

**4. ALS context + connection hook.** `src/config/tenantContext.ts` exposes an
`AsyncLocalStorage<{ tenantId, storeId, scope }>`. Middleware wraps each request in it.
A Prisma client extension/hook (`query` component or a `$on`/connection wrapper) runs
`SELECT set_config('app.current_tenant', $tenantId, true)` (transaction-local) before
the request's queries. Connection-pool safety: transaction-local config resets on
transaction end; alternatively set-per-acquire with a per-connection WeakMap guard.
Either way, **a pooled connection must never carry another tenant's context** — covered
by tests.

**5. Background workers** (outbox worker, print job poller, POS order service —
`src/services/pos/orders/outboxWorker.ts`, `posOrderService.ts`,
`printJob.service.ts`, `thermalPrinter.service.ts`) run outside requests: each reads a
row, then enters an ALS context from that row's `tenantId`/`storeId` before doing
per-row work. They must never run scoped queries without a context.

**6. Explicit escape hatch.** `getUnscopedPrisma()` (or a connection that sets the
session var empty) is the only sanctioned way to query across tenants — for migrations,
the super-admin console, and platform ops. Grep-able and reviewed.

**7. Optional ergonomic extension (non-load-bearing).** We may add a Prisma `where`
-injection extension so a developer who forgets context gets a clear error instead of an
empty result. Isolation correctness does **not** depend on it — RLS is authoritative.

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
  store. The acting store comes from request context (Phase 1: the tenant's single
  default store).
- `SUPER_ADMIN` is added to `ROLE_NAMES`. The role *catalog* stays global; only
  assignment is scoped (via `User.tenantId` + `UserRole.storeId`).

## Data Migration (wrapping existing data)

Executed in order:

1. Create `Tenant`/`Store` tables and `TenantStatus`/`StoreStatus` enums.
2. Create the non-superuser `app_user` role; grant table privileges (no `BYPASSRLS`).
3. Add `tenantId`/`storeId` columns as **nullable** (with the `current_setting` DEFAULT).
4. Insert the **default tenant** (the real smoke shop; slug = production subdomain) and
   its **default store** (`isDefault=true`).
5. Backfill every existing row's `tenantId` = default tenant; store-scoped rows'
   `storeId` = default store. Existing admin user → tenant `ADMIN` (`storeId=null`).
6. Alter scoped columns to **NOT NULL**, add FKs + composite indexes (leading with
   `tenantId`/`storeId`).
7. Enable RLS + create policies on all scoped tables.
8. Switch the app's runtime `DATABASE_URL` to `app_user`.

Non-destructive and reversible up to the NOT NULL / RLS-enable steps. The live app
behaves identically because exactly one tenant exists until the Demo is seeded.

### Indexing

Hot single-column indexes become composite, leading with the scope key:
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

## Risks & Open Items

- **Pervasive `tenantId`** touches ~25 tables — but with RLS-first, *service code is
  unchanged*; risk concentrates in the migration and the connection hook.
- **Superuser footgun:** must run as `app_user`; enforced by startup assertion + test.
- **Connection pooling:** session var must be transaction-local (or per-acquire +
  WeakMap). When a pooler (PgBouncer) is later added it must run in **transaction mode**.
- **Raw queries / nested writes** are now covered by RLS (the previous gap is closed).
- **Subdomain/DNS/TLS** infra is a prerequisite for the demo to be reachable in prod.

## Phasing (recap)

1. **Phase 1 (this spec)** — Foundation + Demo, RLS-first isolation.
2. **Phase 2** — Location picker, `StoreVariantOverride` (per-store price/stock/
   visibility, stock relocation), staff store-assignment, store-scoped dashboards.
3. **Phase 3** — Super-admin console; later, self-service tenant signup.
