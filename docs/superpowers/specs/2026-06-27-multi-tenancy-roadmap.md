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

## Core Decisions (apply across all phases)

- **Hierarchy:** Tenant (owning business) → Store (location/storefront) → Users/Orders.
- **Catalog:** tenant-level master catalog + per-store overrides.
- **Customers:** tenant-level (one account shops any store in the tenant).
- **Website/branding settings:** tenant-level.
- **Tenant resolution:** subdomain → tenant; store selected in-app (not in URL).
- **Platform admin:** super-admin console above all tenants.
- **Isolation:** app-layer Prisma extension (primary) + Postgres RLS (backstop). The
  `tenantId`/`storeId` columns are the only irreversible decision and are added in
  Phase 1.

## Phases at a Glance

| Phase | Theme | Ships | Spec |
|-------|-------|-------|------|
| 1 | Foundation + Demo | Tenant/Store models, full `tenantId`/`storeId` scoping, data migration into a default tenant, Prisma-extension isolation, subdomain middleware, tenant-aware JWT, seeded Demo tenant | `2026-06-27-multi-tenancy-foundation-design.md` |
| 2 | Store mechanics | Location picker, `StoreVariantOverride` (per-store price/stock/visibility + stock relocation), staff multi-store assignment, store-scoped dashboards | TBD |
| 3 | RLS backstop | Postgres RLS policies, transaction-scoped `set_config`, transaction-mode pooling (PgBouncer) | TBD |
| 4 | Super-admin console | Create/suspend tenants, manage plans/branding; later self-service tenant signup | TBD |

## Phase 1 — Foundation + Demo

**Goal:** stand up the multi-tenant skeleton and deliver the isolated Demo tenant.
Wraps all existing data into a default tenant so the live app is unaffected.

- New `Tenant`/`Store` entities; `tenantId`/`storeId` across all tables.
- Non-destructive data migration (nullable → backfill → NOT NULL).
- Prisma client extension auto-injects tenant scope on every query.
- Subdomain resolution middleware + tenant-aware JWT (mismatch rejected).
- `User.tenantId` (null = super-admin), `UserRole.storeId` (null = tenant-wide).
- Demo tenant seed: fake catalog, orders in every stage, Management + customer demo
  users.

**Out of scope here:** per-store overrides, store picker, RLS, super-admin UI.

## Phase 2 — Store Mechanics

Turns "one default store per tenant" into real multi-store operation.

- **Location picker:** customer chooses/switches store; selection persists; single-store
  tenants auto-select.
- **`StoreVariantOverride`:** per-store `hidden`/`priceOverride`/`stock`; **stock
  relocates** from `ProductVariant` to this table.
- **Staff store-assignment UI:** assign EMPLOYEE/MANAGEMENT/DELIVERY_DRIVER to specific
  stores (multiple rows for multi-store staff).
- **Store-scoped dashboards:** orders, print jobs, POS routing filtered by store.

## Phase 3 — RLS Backstop

Defense-in-depth so a forgotten filter or raw query can't leak across tenants.

- RLS policies on all tenant/store-scoped tables.
- Per-request `set_config('app.current_tenant', …, true)` (transaction-local) so pooled
  connections never carry stale tenant context.
- Adopt transaction-mode pooling (PgBouncer) — RLS dictates pooling mode.
- Audit and close raw-query / background-worker gaps identified in Phase 1.
- Sequenced **before** any real outside tenant is onboarded.

## Phase 4 — Super-Admin Console (+ later: self-service)

The platform control plane.

- Super-admin (`tenantId=null`) UI: create/suspend tenants, provision subdomains, seed
  per-tenant defaults, manage plans/branding.
- Later: public self-service tenant signup with automated provisioning and abuse
  prevention.

## Cross-Cutting Infra

- Wildcard DNS (`*.yourapp.com`) + wildcard TLS for per-tenant subdomains.
- Composite indexes leading with `tenantId`/`storeId` on hot paths.
- Background workers (print agent, POS outbox) must use tenant-scoped clients derived
  from each row's `tenantId`.
