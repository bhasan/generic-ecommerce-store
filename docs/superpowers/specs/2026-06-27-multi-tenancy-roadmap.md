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
The field-proven shared-DB isolation pattern (incl. the Medusa community guide) is
**Postgres RLS as primary enforcement + AsyncLocalStorage to carry tenant context** —
which this roadmap adopts from Phase 1.

## Core Decisions (apply across all phases)

- **Hierarchy:** Tenant (owning business) → Store (location/storefront) → Users/Orders.
- **Catalog:** tenant-level master catalog + per-store overrides.
- **Customers:** tenant-level (one account shops any store in the tenant).
- **Website/branding settings:** tenant-level.
- **Tenant resolution:** subdomain → tenant; store selected in-app (not in URL).
- **Platform admin:** super-admin console above all tenants.
- **Isolation:** **Postgres RLS is primary, from Phase 1**; ALS carries `{tenantId,
  storeId}` per request to a connection hook that sets the session variable. App
  business logic is unchanged. App connects as a **non-superuser** role (RLS is bypassed
  for superusers). An optional Prisma where-injection extension is dev-ergonomic sugar
  only, not load-bearing.
- **Roles:** global role-name catalog + scoped assignment (`User.tenantId`,
  `UserRole.storeId`); store-aware authorization. No per-tenant custom roles.
- The `tenantId`/`storeId` columns are the only irreversible decision; added in Phase 1.

## Phases at a Glance

| Phase | Theme | Ships | Spec |
|-------|-------|-------|------|
| 1 | Foundation + Demo | Tenant/Store models, full `tenantId`/`storeId` scoping, data migration into a default tenant, **RLS-first isolation** (non-superuser role, policies, ALS context hook), subdomain middleware, tenant-aware JWT + scoped roles, seeded Demo tenant | `2026-06-27-multi-tenancy-foundation-design.md` |
| 2 | Store mechanics | Location picker, `StoreVariantOverride` (per-store price/stock/visibility + stock relocation), staff multi-store assignment, store-scoped dashboards | TBD |
| 3 | Super-admin console | Create/suspend tenants, manage plans/branding; later self-service tenant signup | TBD |

## Phase 1 — Foundation + Demo

**Goal:** stand up the multi-tenant skeleton with database-enforced isolation and
deliver the isolated Demo tenant. Wraps all existing data into a default tenant so the
live app is unaffected.

- New `Tenant`/`Store` entities; `tenantId`/`storeId` across all scoped tables.
- Non-destructive data migration (nullable → backfill → NOT NULL → RLS enable).
- **RLS isolation:** non-superuser `app_user` role, per-table policies keyed on
  `current_setting('app.current_tenant')`, auto-tagging column defaults, ALS context +
  transaction-local `set_config` connection hook, background-worker context entry.
- Subdomain resolution middleware + tenant-aware JWT (mismatch rejected).
- `User.tenantId` (null = super-admin), `UserRole.storeId` (null = tenant-wide),
  store-aware authorization middleware; `SUPER_ADMIN` added to the role catalog.
- Demo tenant seed: fake catalog, orders in every stage, Management + customer demo
  users.

**Out of scope here:** per-store overrides, store picker, super-admin UI.

## Phase 2 — Store Mechanics

Turns "one default store per tenant" into real multi-store operation.

- **Location picker:** customer chooses/switches store; selection persists; single-store
  tenants auto-select.
- **`StoreVariantOverride`:** per-store `hidden`/`priceOverride`/`stock`; **stock
  relocates** from `ProductVariant` to this table.
- **Staff store-assignment UI:** assign EMPLOYEE/MANAGEMENT/DELIVERY_DRIVER to specific
  stores (multiple rows for multi-store staff).
- **Store-scoped dashboards:** orders, print jobs, POS routing filtered by store.

## Phase 3 — Super-Admin Console (+ later: self-service)

The platform control plane.

- Super-admin (`tenantId=null`) UI: create/suspend tenants, provision subdomains, seed
  per-tenant defaults, manage plans/branding.
- Later: public self-service tenant signup with automated provisioning and abuse
  prevention.

## Cross-Cutting Infra

- App connects as non-superuser `app_user`; startup assertion fails otherwise.
- Connection pooling: transaction-local session var now; if a pooler (PgBouncer) is
  added later it must run in **transaction mode** (RLS dictates pooling mode).
- Wildcard DNS (`*.yourapp.com`) + wildcard TLS for per-tenant subdomains.
- Composite indexes leading with `tenantId`/`storeId` on hot paths.
- Background workers (print agent, POS outbox) enter an ALS tenant context derived from
  each row's `tenantId` before running scoped queries.
- Future scaling: per-table `tenantId` keeps DB-per-tenant sharding tractable later.
