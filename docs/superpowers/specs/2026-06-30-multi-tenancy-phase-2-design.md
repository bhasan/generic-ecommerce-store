# Multi-Tenancy Phase 2 — Multi-Store Design

**Branch:** `feature/multi-tenant-phase-2` (off `develop`, which contains all of Phase 1).
**Goal:** Let one tenant (business) run multiple stores (locations), each with its own inventory, pricing, availability, operational settings, delivery origin, and staff — while single-store tenants behave exactly as they do today.

## Context / what Phase 1 already provides
Shared-DB tenancy: tenant resolved from Host/subdomain/JWT/header → AsyncLocalStorage context → Prisma `$extends` auto-injects `tenantId` and `storeId`. `Store` model exists; every tenant has a default store (`isDefault`). Store-scoped tables (`orders`, `order_items`, `payments`, `cart_items`, `print_jobs`, `pos_outbox`, `order_pos_mappings`, `announcements`, `contact_messages`) already carry `storeId`. `UserRole.storeId` exists. Products/variants/categories are **tenant**-scoped (shared catalog); `store_settings` is a single **tenant**-scoped blob.

Today every request falls back to the tenant's **default** store, so a tenant is effectively single-store.

## Core decisions (settled during brainstorming)
1. **The domain identifies the tenant only** (Phase-1 resolution unchanged). The **store is chosen once via a picker** on the site and remembered — no per-store subdomains/domains.
2. **Shared tenant catalog + per-store overrides.** Products/variants stay tenant-level; a store overrides stock/price/availability.
3. **Per-store stock is independent** (locations don't share inventory). The default store inherits `variant.stock` for backward-compat; new stores start out-of-stock.
4. **Settings are tenant-default + per-store override** (a store overrides only what differs; POS config included).
5. **Staff can hold a role at a chosen subset of stores** (or all).
6. **Full scope this phase:** store selection, per-store catalog/stock/pricing, store-scoped checkout, per-store profile + delivery, store management UI, store-scoped admin dashboards, staff↔store assignment.

---

## Section 1 — Store resolution & selection

**Tenant resolution: unchanged** from Phase 1 (custom domain / subdomain / header / JWT / default).

**Active-store resolution (new):** after the tenant is resolved, `resolveTenant` resolves the active store:
1. `X-Store-Id` header present **and** the store belongs to the resolved tenant **and** is `ACTIVE` **and** (for staff) is within the caller's assigned stores → use it.
2. Otherwise → the tenant's **default** store.

The active `storeId` goes into the ALS context (already carried by `runWithTenant`), so the scoped client auto-filters store-scoped tables with no call-site changes. An invalid/foreign store id silently falls back to the default (fail-safe; never cross-tenant/-store).

**Carry mechanism:** the SPA persists the selection in `localStorage` and the shared API client attaches it as the `X-Store-Id` header — consistent with the existing `X-Tenant-*`/JWT header pattern, stateless, no server session. (A cookie can be added later only if store-specific pages are ever SSR-rendered.)

**"All stores" (admin only):** a tenant-admin may select an aggregate view; the resolver sets `storeId = null`, so the scoped client filters by tenant only (all stores). Staff never get "all stores".

**New surface:** `GET /api/stores` (list the tenant's active stores for the picker/switcher) + the `resolveActiveStore` step in the tenant middleware.

---

## Section 2 — Data model & migration

### `StoreVariantOverride` (new, store-scoped)
| field | meaning |
|---|---|
| `storeId` + `variantId` | unique together |
| `stock` (Decimal) | this store's independent inventory |
| `priceOverride` (Decimal?) | `null` → inherit `variant.basePrice` |
| `activeOverride` (Boolean?) | `null` → inherit `variant.active` (lets a store hide a variant) |
| `tenantId`, `storeId` | scoping columns; `@@unique([storeId, variantId])` |
| DB constraint | `stock >= 0` check (mirrors the `variant.stock` check) |

**Effective value resolution for the active store:**
- price = `priceOverride ?? variant.basePrice`
- stock = `override?.stock ?? (store.isDefault ? variant.stock : 0)`
- available = `(activeOverride ?? variant.active)` and product not hidden and `(!variant.stockEnabled || effectiveStock > 0)`

### Settings: tenant default + per-store override
- `ui_settings` gains a **nullable `storeId`**. `store_settings` with `storeId = null` is the **tenant default**; with `storeId = X` is a **partial per-store override**.
- Effective `store_settings` for the active store = **merge(tenant default, store override)**, store wins field-by-field. Covers address, phone, hours, timezone, currency, POS config, notification emails. A store with no override behaves like the tenant config.
- **Branding stays purely tenant-scoped** (logo/colors/favicon/tagline — the shared brand).
- The `SettingsStore` read for store-scoped keys resolves the tenant default then applies the active store's override; cache key includes `storeId` for store-scoped keys.

### `UserRole`
Unique constraint relaxed to **`(userId, roleId, storeId)`** so a person can hold the same role at multiple specific stores (one row per store), with `storeId = null` = all stores. Per-store roles preserved (MANAGER at store 1, EMPLOYEE at store 2). `role.middleware` already checks store match against the active store.

### Migration (hand-authored SQL; no `prisma migrate dev`)
- Create `StoreVariantOverride` + its `stock >= 0` check.
- Add nullable `ui_settings.storeId`.
- Drop the old `UserRole(userId, roleId)` unique index; create `(userId, roleId, storeId)`.
- **No data backfill:** default store inherits `variant.stock`; tenant `store_settings` stays as the default; override tables start empty.

---

## Section 3 — Catalog, cart & checkout for the active store

**Catalog / listing:** the product-listing query left-joins `StoreVariantOverride` on the active `storeId` and computes effective price/availability/stock in one pass. A variant hidden or out of stock at the store shows out-of-stock; a product with no available variants at the store surfaces as unavailable.

**Cart:** `cart_items` are already store-scoped → a cart is naturally per-store. The active store's cart is shown, priced at that store. On store switch, lines unavailable at the new store are flagged, not silently repriced.

**Checkout / order creation:**
- Order created at the active store (`storeId` from context), line items priced at the store's effective price.
- **Atomic stock decrement targets the active store**, preserving today's race protection:
  - default store, no override → decrement `variant.stock` (existing guarded update + DB check) — unchanged.
  - store with an override → atomic guarded decrement of `StoreVariantOverride.stock`, backed by its `stock >= 0` check.
  - the existing stock-race test gains a per-store case.
- Order → **POS outbox** → the worker resolves the POS provider from the order's **store** settings (per-store POS, tenant-default fallback). Extends the Phase-1 per-row-tenant fix to per-row-store.

**Backward-compat:** single-store tenant → default store, `variant.stock`, tenant-default POS → today's flow unchanged.

---

## Section 4 — Delivery & admin

**Per-store delivery (backend):** delivery/pickup computed from the **active store's** effective address (tenant default ⊕ store override). `deliveryEligibility.service` resolves the store address from the active store; its store-address cache moves from tenant-keyed to **store-keyed**; the geocode cache stays global (address-keyed, no leak).

**Admin active-store context:** admins use the same `X-Store-Id` switcher. Options: a specific store (store-scoped view) or **"All stores"** (tenant-admins only → `storeId = null` → tenant-wide aggregate). Staff limited to assigned stores.

**Admin UIs (tenant-admin, `ADMIN` role — distinct from the super-admin Tenants screen):**
1. **Store management** — list/create/edit/suspend stores; set the default; edit each store's setting overrides (address, phone, hours, POS, notification emails).
2. **Per-store inventory & pricing** — manage `StoreVariantOverride` (stock, price override, availability) per store; a store selector added to the existing product-management screen with per-store stock/price columns.
3. **Staff ↔ store assignment** — in user management: pick a user → assign role(s) at specific stores / all stores, writing the `UserRole(userId, roleId, storeId)` rows.
4. **Store-scoped dashboards** — orders, POS outbox, print jobs, reporting honor the active-store switcher (data already store-scoped).

**Backward-compat:** single-store tenant → one store in the switcher (or hidden), delivery from that store (= tenant default), dashboards identical to today.

---

## Section 5 — Testing, migration & rollout

**Backward-compatibility is the acceptance bar for the foundation:** every existing backend + E2E test must stay green unchanged (no `X-Store-Id` → default store; no overrides → `variant.stock` + tenant settings; one store → no picker).

**Testing:**
- **Unit:** effective price/stock/availability resolution; tenant-default ⊕ store-override settings merge; `resolveActiveStore` (customer=any active store, staff=assigned only, fallback=default); multi-store `UserRole`.
- **Integration:** per-store catalog listing; per-store checkout + atomic stock decrement (per-store race case); per-store POS outbox; per-store delivery; store-scoped admin filtering + "all stores" aggregate.
- **Cross-store isolation guardrail** (mirrors the Phase-1 tenant guardrail): store A's orders/stock/settings never visible under store B's context.
- **E2E:** pick-store → catalog → checkout → order lands at that store; admin store switcher; staff constrained to their store.

**Rollout:** extend the Phase-1 prod runbook (`docs/deployment/multi-tenancy/`) with the new migrations (no backfill). CI already type-checks + runs the suite. No feature flag — multi-store is opt-in by a tenant adding a second store; single-store stays identical.

## Implementation order (5 sequential, independently-shippable sub-plans)
1. **2a — Store foundation:** `resolveActiveStore` + `X-Store-Id`, `UserRole` unique change, `GET /api/stores`, backward-compat. Nothing user-visible; default store everywhere.
2. **2b — Per-store settings + delivery:** `ui_settings.storeId`, tenant-default⊕store-override merge, delivery from the active store.
3. **2c — Per-store catalog:** `StoreVariantOverride`, effective resolution, checkout decrement, per-store POS outbox.
4. **2d — Store picker:** customer selection UI + persistence.
5. **2e — Admin UIs:** store management, per-store inventory/pricing, staff↔store assignment, store-scoped dashboards + switcher.

Each sub-plan gets its own implementation plan (writing-plans) and is executed/reviewed before the next.

---

## Post-validation refinements (2026-07-01)

Validated the design against the codebase before implementation. No design-level blockers; Phase 2 is Phase-1-native (storeId ALS context + scoped-client injection, JWT scoped roles `{name,storeId}`, role-middleware store match, and no store-scoped table bypasses the scoped client). Refinements from that review:

- **`storeId 0` is the universal "tenant-wide / default" sentinel** (0 is never a real store id — stores start at 1). It means "all stores / tenant default" for: the tenant-default `ui_settings` row, all-stores `UserRole` rows, and the admin "All stores" aggregate context. The scoped Prisma client is tweaked to **skip the store filter when `ctx.storeId` is `0`** (same as `null` today). This resolves caveat #2 (nullable-`storeId` uniqueness) cleanly — the default settings row is keyed by `storeId = 0`, so `@@unique([tenantId, storeId, key])` works with no NULL-distinctness problem. Existing `null` store values migrate to `0`.
- **Existing staff stay all-stores.** On migration, `user_roles.storeId` `null → 0` for every existing row (all-stores). Adding a store does not auto-restrict existing staff; admins narrow them later via the 2e assignment UI. `role.middleware` treats `storeId 0` (and legacy `null`) as all-stores.
- **Cart is client-side (caveat #1 correction).** There are no server-side `cart_items` writes; the cart lives in the browser and is materialized only at checkout. "Per-store cart" is therefore **2d frontend work**: segregate/reset the cart on store switch and re-validate prices. Additionally, the client cart carries a `savedAt` timestamp and is **cleared after 7 days**.
- **Sequencing impact:** the `storeId 0` sentinel is foundational, so `role.middleware` (treat 0 as all-stores) and the `user_roles.storeId null→0` backfill move into **sub-plan 2a**. The scoped-client `0`-as-no-filter tweak lands in **2e** (where the admin "All stores" context first sets `ctx.storeId = 0`); `ui_settings.storeId = 0` default rows land in **2b**.
- **Minor (accepted):** full-text search ranks on text then hydrates via the scoped client, so per-store price/availability applies at hydration — a variant hidden at a store can rank then be filtered (not hidden from search). No action.
