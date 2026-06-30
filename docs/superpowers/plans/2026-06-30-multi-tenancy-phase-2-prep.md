# Multi-Tenancy Phase 2 — Prep & Scope

**Branch:** `feature/multi-tenant-phase-2` (off `develop` @ 6571560, which merged Phase 1 via PR #99 — includes everything below).
**Status:** prep only. No Phase-2 code yet. Brainstorm/design the open decisions before writing a plan.

## What Phase 1 delivered (the foundation Phase 2 builds on)
Shared-DB tenancy: resolve tenant (Host/subdomain/JWT/header) → AsyncLocalStorage context → Prisma `$extends` auto-injects `tenantId`/`storeId`. Per-tenant tokens (reporting/print), provisioning + super-admin-gated UI, per-tenant settings incl. reporting timezone/currency, fail-closed in prod, CI type-checks. Docs: `docs/deployment/multi-tenancy/` (prod migration), `docs/guides/multi-tenancy*.md`.

**Already in place for stores (key — Phase 2 extends, doesn't build from scratch):**
- `Store` model; every tenant has a default store (`isDefault`). `resolveTenant` sets `req.store` to the default store and puts `storeId` in the ALS context.
- **Store-scoped tables** declared in `backend/src/config/tenantScope.ts`; the scoped client injects `storeId` on those tables automatically.
- `UserRole.storeId` exists (staff can be scoped to a store); `role.middleware.ts` already checks store match.
- Orders/payments/print_jobs/pos_outbox/etc. carry `storeId` and are backfilled to the default store.

So today a tenant is effectively **single-store**: every request uses the tenant's *default* store, and catalog/stock/pricing are tenant-level.

## Phase 2 goal
Let one tenant run **multiple stores** (locations) with their own inventory, pricing, staff, and operations — while single-store tenants keep working unchanged.

## Workstreams
1. **Active-store resolution** (THE central design decision). Today every request → default store. Phase 2 must resolve a *specific* store per request. Options: URL path (`/s/:storeSlug`), per-store subdomain, selected-store cookie/header, or SPA store-picker state. Must stay backward-compatible (no store selected → default store).
2. **Per-store catalog / stock / pricing** — new `StoreVariantOverride` (storeId + variantId → stock / price). Tenant-level `ProductVariant` is the base; store override wins. Wire into product/catalog queries, availability, and the **stock-decrement / order-create path** (the atomic stock race is currently variant-level).
3. **Store / location picker (frontend)** — customer selects a store; persist; reflect in catalog + delivery eligibility (store address per store already resolvable).
4. **Staff multi-store assignment** — UI to set `UserRole.storeId`; enforce store scoping in admin/ops actions.
5. **Store-scoped dashboards / ops** — orders, POS outbox, print jobs, reporting filtered by active store (data is already `storeId`-scoped; needs active-store context + UI).

## Open design decisions (need answers before planning)
- **Active-store resolution mechanism?** (path `/s/:slug` vs store subdomain vs picker+cookie). Drives middleware + frontend routing.
- **Pricing override:** absolute price vs delta/percentage? Per-store stock vs shared tenant stock with per-store allocation?
- **Store lifecycle:** create/suspend stores via the existing super-admin/tenant UI or a tenant-admin "stores" screen?
- **Backward compat:** confirm single-default-store tenants are untouched (default store when none selected).

## Likely files
- Schema: `backend/prisma/schema.prisma` (StoreVariantOverride; maybe Store fields), `backend/src/config/tenantScope.ts`.
- Resolution: `backend/src/middleware/tenant.middleware.ts` (+ `tenantContext.ts` already carries storeId).
- Catalog/stock: `backend/src/services/product*.ts`, `order.crud.service.ts` (stock decrement), availability/delivery services.
- Frontend: store-picker (new), admin store selector, `web/src/context/` (active store), `web/src/services/*`.

## Suggested first step
Brainstorm + decide **active-store resolution** and the **StoreVariantOverride** model (the two load-bearing decisions), then write the implementation plan (writing-plans skill) and execute task-by-task.
