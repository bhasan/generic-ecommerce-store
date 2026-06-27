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
phases (store mechanics, RLS backstop, super-admin console) get their own specs.

## Conceptual Model (decisions already made)

- **Hierarchy:** `Tenant` (the owning business) → `Store` (a storefront/location) →
  Users, Orders. A tenant may have many stores; Phase 1 ships each tenant with one
  default store.
- **Catalog:** tenant-level master catalog **+ per-store overrides** (override layer
  is Phase 2; Phase 1 ships the tenant-level master catalog only).
- **Customers:** tenant-level — one customer account shops any store within the tenant.
  Orders are still tied to a specific store.
- **Website/branding settings (`UiSetting`):** tenant-level. No per-store override in
  Phase 1.
- **Tenant resolution:** subdomain → tenant (`acme.yourapp.com` → tenant Acme). Store
  is selected *inside* the app (location picker — Phase 2), not in the URL, so the
  auth cookie and customer account span all of a tenant's stores.
- **Platform administration:** a super-admin console (Phase 4). Phase 1 creates
  tenants via seed/CLI.
- **Isolation strategy:** app-layer **Prisma client extension** as the primary
  mechanism (Phase 1), with **Postgres Row-Level Security (RLS)** as a defense-in-depth
  backstop sequenced **second** (Phase 3, before any real outside tenant is onboarded).
  The `tenantId`/`storeId` columns — the only irreversible schema decision — are added
  now, up front, and serve all strategies and any future sharding.

## Scope of Phase 1

In scope:

1. New core entities: `Tenant`, `Store`.
2. Add `tenantId` / `storeId` columns across all existing tables (see scoping map).
3. Data migration wrapping all existing data into a **default tenant + default store**.
4. Prisma client extension enforcing tenant scoping on all queries.
5. Subdomain → tenant resolution middleware.
6. Tenant-aware JWT (`tenantId` in token, cross-checked against resolved subdomain).
7. User ↔ Store ↔ Role model (`User.tenantId`, `UserRole.storeId`).
8. Seed the **Demo tenant** (fake catalog + orders across all stages, a Management
   demo user, a customer demo user).

Out of scope (later phases):

- Per-store catalog overrides / per-store stock (`StoreVariantOverride`) — Phase 2.
- Location picker / store-switching UX — Phase 2.
- Staff multi-store assignment UI — Phase 2.
- RLS policies + `set_config` plumbing + pooling mode — Phase 3.
- Super-admin console UI, self-service tenant signup — Phase 4.

## New Entities

```
Tenant
  id          Int      @id @default(autoincrement())
  slug        String   @unique   // maps to subdomain
  name        String
  status      TenantStatus @default(ACTIVE)   // ACTIVE | SUSPENDED
  plan        String?  // free-form for now; billing is later
  createdAt / updatedAt

Store
  id          Int      @id @default(autoincrement())
  tenantId    Int
  name        String
  slug        String
  isDefault   Boolean  @default(false)
  status      StoreStatus @default(ACTIVE)
  // operational fields migrated from existing global settings as applicable:
  // address, hours, deliveryZone, printerConfig (kept minimal in Phase 1)
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
`StoreCreditTransaction`, `UiSetting`.

**Store-scoped — add `storeId` (and `tenantId` for the RLS backstop / direct
filtering):**
`Order`, `OrderItem`, `OrderStatusEvent`, `Payment`, `CartItem`, `PrintJob`,
`PosOutbox`, `OrderPosMapping`.

**Judgment calls (approved):**
- `Announcement` → store-scoped, with an optional tenant-wide flag
  (`storeId` nullable; null = broadcast to all of the tenant's stores).
- `ContactMessage` → store-scoped.
- **Stock** → conceptually moves from `ProductVariant` to the per-store override
  table in **Phase 2**. In Phase 1, `ProductVariant.stock` remains as-is (tenant-level)
  to avoid coupling the foundation to the override layer; the migration note is
  recorded so Phase 2 can relocate it.

**Not scoped (global infrastructure):**
`Role` (role *names* are global; assignment is scoped via `UserRole`),
`RefreshToken` (scoped transitively through its `User`),
`AddressGeocodeCache` (a shared geocoding cache, not tenant data).

## User ↔ Store ↔ Role

```
User      + tenantId Int?     // nullable; null = platform super-admin
UserRole  + storeId  Int?     // nullable; null = tenant-wide role
```

- **Customer:** `UserRole(role=CUSTOMER, storeId=null)` — shops any store in tenant.
- **Tenant Owner/Admin:** `UserRole(role=ADMIN, storeId=null)` — admins whole tenant,
  including the master product catalog and website settings.
- **Store Manager/Employee/Driver:** `UserRole(role=MANAGEMENT|EMPLOYEE|DELIVERY_DRIVER,
  storeId=<store>)` — pinned to a store. Multiple stores = multiple rows.
- **Super-admin:** `User.tenantId=null`, `UserRole(role=SUPER_ADMIN, storeId=null)`.

`SUPER_ADMIN` is added to `ROLE_NAMES`.

## Request Lifecycle & Isolation

1. **Subdomain resolution middleware** (runs early, before auth): reads the request
   hostname, extracts the subdomain, looks up the `Tenant` by `slug`, attaches
   `req.tenantId` (and `req.tenant`). Unknown/suspended tenant → 404/403. The apex/no
   subdomain (or a reserved `admin` subdomain) routes to the super-admin context.
2. **Auth middleware** (existing, extended): verifies JWT; the token now carries
   `tenantId`. Cross-check: token `tenantId` **must equal** the subdomain-resolved
   `req.tenantId`, else 401 — a token minted for tenant A can never authenticate
   against tenant B. Super-admin tokens (`tenantId=null`) are exempt and only valid on
   the admin context.
3. **Request-scoped Prisma client:** a Prisma client extension (`forTenant(tenantId)`)
   auto-injects `tenantId` into every `where` (reads/updates/deletes) and every
   `create`/`createMany` `data`. Services consume the request-scoped client and stay
   clean (`prisma.product.findMany()` → `WHERE tenantId = N` injected). Store-scoped
   operations additionally filter/inject `storeId` from request context where
   applicable.

### Isolation extension — boundaries & escape hatches

- The extension covers all model queries. **Raw queries (`$queryRaw`/`$executeRaw`)
  bypass it** — these are flagged for audit and are exactly what the Phase 3 RLS
  backstop will protect. Phase 1 forbids new raw queries on tenant-scoped tables
  without explicit tenant filtering.
- Background jobs / workers (print agent, POS outbox) must construct a tenant-scoped
  client explicitly from the row's `tenantId`; they must never use an unscoped client
  for tenant data.
- An explicit, audited unscoped client is available only for: migrations, the
  super-admin console, and cross-tenant platform operations.

## Tenant-Aware JWT

`JwtPayload` gains `tenantId: number | null`. `generateToken` callers in
`auth.service` include it. `verifyToken` consumers cross-check against `req.tenantId`
in middleware. Refresh-token rotation is unchanged structurally; the minted access
token simply includes `tenantId`.

## Data Migration (wrapping existing data)

A Prisma migration + data backfill, executed in order:

1. Create `Tenant` and `Store` tables, `TenantStatus`/`StoreStatus` enums.
2. Add `tenantId`/`storeId` columns as **nullable** initially.
3. Insert the **default tenant** (the real smoke shop; slug e.g. `app` or the existing
   production subdomain) and its **default store** (`isDefault=true`).
4. Backfill every existing row's `tenantId` = default tenant id; every store-scoped
   row's `storeId` = default store id. Existing admin user → tenant `ADMIN`
   (`storeId=null`).
5. Alter `tenantId` (and store-scoped `storeId`) to **NOT NULL** and add FKs +
   composite indexes (`@@index([tenantId, ...])` on hot paths: products by category,
   orders by status/createdAt, etc.).

The app keeps working unchanged because exactly one tenant exists; multi-tenancy
"switches on" when the Demo tenant is seeded. The migration is non-destructive and
reversible up to the NOT NULL step.

### Indexing

Existing single-column indexes that are now tenant-hot become composite, leading with
`tenantId` (or `storeId` for store-scoped tables): e.g. `Order @@index([storeId,
status])`, `@@index([storeId, createdAt])`, `Product @@index([tenantId, categoryId])`.

## Demo Tenant Seed

A seed script (extending the pattern of `seed-prod.ts`) provisions:

- A `Tenant` with slug `demo` (→ `demo.yourapp.com`), one default `Store`.
- A **fake catalog**: categories + products + variants with obviously-fake,
  non-real-inventory names/prices and placeholder images.
- **Orders across all stages**: at least one order in each meaningful `OrderStatus`
  (PENDING, APPROVED, READY_FOR_DELIVERY, OUT_FOR_DELIVERY, DELIVERED,
  READY_FOR_PICKUP, PICKED_UP, etc.), with line items, status events, and payment
  rows, so the staff dashboard looks live.
- A **Management demo user** (store-scoped MANAGEMENT role) and a **customer demo user**
  (tenant-scoped CUSTOMER), both pre-approved, with known credentials.
- Idempotent, re-runnable; safe to run against prod to refresh the demo.

Demo is **read-only-ish for safety**: Phase 1 does not add destructive guards beyond
tenant isolation (the demo simply can't see or touch real data). If interactive demo
mutations prove undesirable later, a nightly reseed/reset can be added — not in Phase 1.

## Frontend Impact (Phase 1, minimal)

- API base stays `/api`; the browser already sends the correct `Host` subdomain, so
  tenant resolution is server-side and the frontend needs **no per-request tenant
  param**.
- Auth/session continues to work per-subdomain (cookie scoped to the tenant subdomain).
- No location picker yet (single default store per tenant in Phase 1).
- Deployment: wildcard DNS (`*.yourapp.com`) + wildcard TLS so `demo.` and the real
  tenant subdomain both resolve. (Infra task, tracked in the plan.)

## Testing Strategy

- **Unit:** Prisma extension injects `tenantId`/`storeId` correctly on
  find/create/update/delete; cross-tenant queries return empty; JWT tenant mismatch
  rejected by middleware.
- **Integration:** two tenants seeded; assert tenant A's API can never read/modify
  tenant B's products/orders/users; super-admin context can; subdomain resolution maps
  host→tenant and rejects unknown/suspended.
- **Migration:** run against a snapshot of single-tenant data; assert all rows acquire
  the default tenant/store and the app behaves identically.
- Existing service/controller test suites updated to run under a tenant-scoped client.

## Risks & Open Items

- **Pervasive change:** `tenantId` touches ~25 tables and most services. Mitigated by
  the Prisma extension (centralized enforcement) so service code changes are minimal.
- **Raw queries / background workers** are the isolation gap until Phase 3 RLS — audited
  and constrained in Phase 1.
- **Connection pooling** is a Phase 3 concern (RLS requires transaction-mode pooling);
  noted now so the Phase 1 Prisma setup doesn't paint us into a corner.
- **Subdomain/DNS/TLS** infra is a prerequisite for the demo to be reachable in prod.

## Phasing (recap)

1. **Phase 1 (this spec)** — Foundation + Demo tenant.
2. **Phase 2** — Location picker, `StoreVariantOverride` (per-store price/stock/
   visibility, stock relocation), staff store-assignment, store-scoped dashboards.
3. **Phase 3** — RLS backstop (policies + transaction-scoped `set_config` + pooling).
4. **Phase 4** — Super-admin console; later, self-service tenant signup.
