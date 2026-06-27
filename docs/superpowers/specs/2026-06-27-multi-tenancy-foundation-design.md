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

The clean and lightweight way to do *shared-database* tenant isolation is **Prisma Client Extensions that automatically inject `tenantId` (and `storeId` if applicable) into query filters and write payloads**, using **AsyncLocalStorage (ALS)** to carry the active request context. Business logic needs **zero** changes, connection pooling works natively in transaction mode, and the database requires no raw SQL RLS policies, custom configuration variables, or database privilege splits.

## Conceptual Model (decisions made)

- **Hierarchy:** `Tenant` (the owning business) → `Store` (a storefront/location) → Users, Orders. A tenant may have many stores; Phase 1 ships each tenant with one default store.
- **Catalog:** tenant-level master catalog **+ per-store overrides** (override layer is Phase 2; Phase 1 ships the tenant-level master catalog only).
- **Customers:** tenant-level — one customer account shops any store within the tenant. Orders are still tied to a specific store. (`approved` becomes per-tenant for free, since customers are tenant-scoped user rows.)
- **Website/branding settings (`UiSetting`):** tenant-level. No per-store override in Phase 1.
- **Tenant resolution:** resolved using a chain of priority: explicit request headers (`X-Tenant-ID` or `X-Tenant-Slug`), active user session JWTs, or hostname custom domains / subdomain slugs. Falls back to the default tenant (`slug: 'app'`) on the main domain.
- **Platform administration:** a super-admin console (later phase). Phase 1 creates tenants via seed/CLI.
- **Isolation strategy:** **Prisma Client Extension query filtering is the primary mechanism.** ALS carries `{ tenantId, storeId }` per request; Prisma automatically appends the matching `tenantId`/`storeId` to all query read `where` filters and write `data` payloads. The app's business logic remains unchanged and clean.
- **Roles:** **global role catalog + scoped assignment.** Role *names* are fixed platform-wide; scope comes from `User.tenantId` and `UserRole.storeId`. No per-tenant custom roles (deferred indefinitely).

## Scope of Phase 1

In scope:

1. New core entities: `Tenant`, `Store`.
2. Add `tenantId` / `storeId` columns across all existing tenant/store tables.
3. Data migration wrapping existing data into a **default tenant + default store**.
4. **ORM Isolation**: Prisma Client Extension query filtering, supported by ALS request context.
5. Multi-channel tenant resolution middleware (headers, sessions, hostnames).
6. Tenant-aware JWT (`tenantId` + scoped roles in token, cross-checked against resolved tenant).
7. User ↔ Store ↔ Role model (`User.tenantId`, `UserRole.storeId`) + store-aware authorization middleware.
8. Seed the **Demo tenant** (fake catalog + orders across all stages, a Management demo user, a customer demo user).
9. **CI guardrails** for tenant isolation (see CI Guardrails section): verification checks asserting that the Prisma extension correctly injects tenant constraints and prevents cross-tenant leaks.

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

## Isolation: ORM-first (the security core)

**1. Prisma Client Extension.** Isolation is enforced at the application/ORM layer. A Prisma Client Extension intercepts all operations on scoped models, automatically injecting the tenant filter (`where: { tenantId: ctx.tenantId }`) on reads/updates/deletes and the scope keys (`data: { tenantId: ctx.tenantId }`) on inserts.

**2. Tenant-tagged columns with no defaults.** Scoped tables carry standard, required `tenantId` (store tables also `storeId`) columns in `schema.prisma`. Any writes bypassing the extended client (e.g. un-instrumented migrations) fail-closed with a standard database `NOT NULL` constraint violation.

**3. Connection pooling & PgBouncer compatibility.** Because query filtering is completely stateless and does not depend on database roles, transactions, or session-level configurations, connection pools (including PgBouncer running in **Transaction Mode**) scale natively without connection context leaks.

**4. Background workers.** Background tasks poll using the base unscoped client to fetch pending items across all tenants (e.g. outbox items or print jobs). Once fetched, the worker enters the specific ALS tenant context for that row to process the execution in isolation.

**5. Explicit escape hatch.** `getUnscopedPrisma()` returns the base Prisma client without query filters, providing a clear and audit-friendly escape hatch for platform-wide metrics, migrations, and platform console admin actions.

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
2. Add `tenantId`/`storeId` columns to existing scoped tables as **nullable** (`INTEGER`).
3. Insert the **default tenant** (the real smoke shop; slug = production subdomain) and its **default store** (`isDefault=true`).
4. Backfill every existing row's `tenantId` = default tenant; store-scoped rows' `storeId` = default store.
5. Alter all scoped columns to **NOT NULL**.
6. Drop global unique constraints on `slug`, `email`, and `username`, and add tenant-scoped composite unique constraints (e.g. `@@unique([tenantId, slug])`).
7. Add Foreign Keys + composite indexes leading with `tenantId`/`storeId` on hot paths.

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

- API base stays `/api`. The active tenant context is resolved server-side from headers, active JWT sessions, or custom hostnames/subdomains.
- Auth/session works per-domain or subdomain (cookie scoped to the specific host domain) to prevent login conflicts.
- No location picker yet (single default store per tenant).
- Deployment: wildcard DNS and wildcard TLS are required only if subdomain-based routing is used; single-domain setups require no DNS adjustments.

## Testing Strategy

- **Isolation (the priority):** two tenants seeded; assert tenant A's API can never read/modify tenant B's products/orders/users via the extended Prisma client; verify that standard ORM queries automatically inject tenant-filtering constraints; verify that startup fails if the default tenant is missing.
- **Resolution/auth:** host→tenant mapping; unknown/suspended tenant rejected; JWT tenant mismatch rejected; store-aware role checks (tenant-wide vs store-scoped).
- **Migration:** run against a snapshot of single-tenant data; all rows acquire the default tenant/store; app behaves identically.
- Existing service/controller suites run under a tenant context.

## CI Guardrails

Tenant-isolation failures are *silent* (a leak, not an error), so they will not surface
These automated checks make a regression turn the build red. They are designed to **fail safe**: a newly added table is unprotected until explicitly classified.

**Required in Phase 1 (the catastrophic cases):**

1. **Every scoped table has the scope key.** Check schema model definitions to ensure all tables except the UNSCOPED allowlist contain `tenantId` (and `storeId` if store-scoped).
2. **Cross-tenant leak integration test.** Seed two tenants; under tenant A's context, assert reads return only A's rows, and updates targeting B's IDs affect zero rows.
3. **Query extension validation.** Assert that the extended client is active and that standard queries are automatically injected with the resolved tenant constraints.

**Strongly recommended:**

4. **Unscoped-access allowlist** — `getUnscopedPrisma()` or raw Prisma client imports may only be used in approved files (migrations, worker startup, platform controllers). A new call site fails until reviewed.
5. **Raw SQL Audit.** Since raw SQL (`$queryRaw` / `$executeRaw`) bypasses the Prisma Client Extension query hooks, raw queries must be audited in CI to verify they explicitly enforce `tenant_id` constraints.

## Risks & Open Items

- **Pervasive `tenantId`** touches ~25 tables — but with ORM-first, *service code is unchanged*; risk concentrates in the model definitions and the Prisma Client Extension.
- **Raw Queries Leak Window:** Raw SQL statements bypass Prisma Client Extensions. A code linter or regex scan in CI should alert on any `$queryRaw` usage that does not contain a `tenant_id` pattern.
- **JWT payload shape change needs a grace path.** Tokens move from `roles: RoleName[]` to `tenantId` + scoped `roles: { name, storeId }[]`. Access tokens issued before deploy won't carry the new fields. To prevent user disruption, a brief tolerance window treats tokens missing a `tenantId` as mapped **strictly to the default tenant** (ID = 1). If a legacy token is presented on a non-default tenant subdomain, it must be rejected (401).

## Phasing (recap)

1. **Phase 1 (this spec)** — Foundation + Demo, ORM-first isolation.
2. **Phase 2** — Location picker, `StoreVariantOverride` (per-store price/stock/visibility, stock relocation), staff store-assignment, store-scoped dashboards.
3. **Phase 3** — Super-admin console; later, self-service tenant signup.
