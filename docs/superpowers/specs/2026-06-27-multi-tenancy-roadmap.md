# Multi-Tenancy Roadmap — All Phases Overview

**Date:** 2026-06-27
**Status:** Living overview. Phase 1 has a full design doc
(`2026-06-27-multi-tenancy-foundation-design.md`); later phases get their own specs
when reached.

## Why

Move the app from single-tenant (one smoke shop, one global catalog) to a full
**`Tenant → Store → Users/Orders`** hierarchy. Immediate payoff: an isolated public
**Demo tenant**. Long-term payoff: a white-label SaaS platform that can onboard real
outside businesses, each fully walled off from the others.

## Research basis

Medusa (reference commerce platform) does **not** ship multi-tenancy natively — it stays
a tenant-agnostic engine and pushes tenancy governance into an external orchestration
layer, offering shared-multi-store, database-per-tenant, and hybrid isolation shapes.
Its "Store + Sales Channels" maps to our Tenant→Store split, not to tenant isolation.
The field-proven shared-DB isolation pattern is **Prisma Client Extensions that automatically inject tenant filters into all queries + AsyncLocalStorage to carry tenant context** — which this roadmap adopts.

## Core Decisions (apply across all phases)

- **Hierarchy:** Tenant (owning business) → Store (location/storefront) → Users/Orders.
- **Catalog:** tenant-level master catalog + per-store overrides.
- **Customers:** tenant-level (one account shops any store in the tenant).
- **Website/branding settings:** tenant-level.
- **Tenant resolution:** resolved via a priority chain: request headers, active JWT sessions, or custom domains/subdomain slugs (with fallback to default tenant on main domain).
- **Platform admin:** super-admin console above all tenants.
- **Isolation:** **Prisma Query Extension is primary, from Phase 1**; ALS carries `{tenantId, storeId}` per request, and an extended Prisma client automatically appends `tenantId` (and `storeId` if store-scoped) to all query filters (`where` clauses) and write objects (`data`). App business logic is unchanged and tenant-blind. The database requires no RLS policies, custom session configurations, or database role privilege splits.
- **Roles:** global role-name catalog + scoped assignment (`User.tenantId`, `UserRole.storeId`); store-aware authorization. No per-tenant custom roles.
- The `tenantId`/`storeId` columns are the only irreversible decision; added in Phase 1.

## Phases at a Glance

| Phase | Theme | Ships | Spec |
|-------|-------|-------|------|
| 1 | Foundation + Demo | Tenant/Store models, full `tenantId`/`storeId` scoping, data migration into a default tenant, **ORM-enforced isolation** (Prisma client extension query filters), subdomain middleware, tenant-aware JWT + scoped roles, seeded Demo tenant | `2026-06-27-multi-tenancy-foundation-design.md` |
| 2 | Store mechanics | Location picker, `StoreVariantOverride` (per-store price/stock/visibility + stock relocation), staff multi-store assignment, store-scoped dashboards | TBD |
| 3 | Super-admin console | Create/suspend tenants, manage plans/branding; later self-service tenant signup | TBD |

## Phase 1 — Foundation + Demo

**Goal:** stand up the multi-tenant skeleton with ORM-enforced isolation and deliver the isolated Demo tenant. Wraps all existing data into a default tenant so the live app is unaffected.

- New `Tenant`/`Store` entities; `tenantId`/`storeId` across all scoped tables.
- Non-destructive data migration (nullable → backfill → NOT NULL).
- **ORM isolation:** Prisma query extension that automatically injects tenant scope to `where` query filters and `create` write objects; ALS context resolves tenant ID per request.
- Multi-channel tenant resolution middleware (headers, sessions, domains) + tenant-aware JWT (mismatch rejected on protected routes).
- `User.tenantId` (null = super-admin), `UserRole.storeId` (null = tenant-wide), store-aware authorization middleware; `SUPER_ADMIN` added to the role catalog.
- Demo tenant seed: fake catalog, orders in every stage, Management + customer demo users.

**Out of scope here:** per-store overrides, store picker, super-admin UI.

## Phase 2 — Store Mechanics

Turns "one default store per tenant" into real multi-store operation.

- **Location picker:** customer chooses/switches store; selection persists; single-store tenants auto-select.
- **`StoreVariantOverride`:** per-store `hidden`/`priceOverride`/`stock`; **stock relocates** from `ProductVariant` to this table.
- **Staff store-assignment UI:** assign EMPLOYEE/MANAGEMENT/DELIVERY_DRIVER to specific stores (multiple rows for multi-store staff).
- **Store-scoped dashboards:** orders, print jobs, POS routing filtered by store.

## Phase 3 — Super-Admin Console (+ later: self-service)

The platform control plane.

- Super-admin (`tenantId=null`) UI: create/suspend tenants, provision subdomains, seed per-tenant defaults, manage plans/branding.
- Later: public self-service tenant signup with automated provisioning and abuse prevention.

## Cross-Cutting Infra

- App connects via standard connection pools. No custom database roles or privilege splits required.
- Connection pooling: fully compatible with connection poolers (PgBouncer) in **Transaction Mode** since Prisma query filtering is completely stateless.
- Wildcard DNS (`*.yourapp.com`) + wildcard TLS for per-tenant subdomains.
- Composite indexes leading with `tenantId`/`storeId` on hot paths.
- Background workers (print agent, POS outbox) enter an ALS tenant context derived from each row's `tenantId` to automatically filter queries during processing.
- **Media & Asset Isolation:** Media storage (AWS S3/local directories) isolates uploaded assets using prefixes/folders named `tenants/:tenantId/` to prevent cross-tenant asset exposure.
- **Subdomain Cookie Scoping:** To prevent session cookie collision, auth cookies are scoped strictly to the individual subdomain (e.g., `shop-a.yourapp.com`), not the apex domain (`.yourapp.com`).
- **Soft-Delete Lifecycle:** Tenant deletion/removal changes `Tenant.status` to `SUSPENDED` or `DELETED` and blocks requests at the middleware layer, avoiding database hard deletes and preserving historical records.
- Future scaling: per-table `tenantId` keeps DB-per-tenant sharding tractable later.
