# Multi-Tenancy Phase 2e — Admin UIs & Store Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Give tenant admins the tools to run multiple stores: create/edit/suspend stores (with an optional "Clone from default store"), manage per-store stock/price/availability, assign staff to stores, and switch the active store (incl. an "All stores" aggregate) across the admin dashboards. Completes the deferred `storeId 0 → no store filter` scoped-client tweak.

**Architecture:** Backend CRUD for stores + `StoreVariantOverride` + staff↔store assignment (all tenant-admin, `authorizeAdmin`). Admins reuse the same `X-Store-Id` switcher as customers; **"All stores" sends `X-Store-Id: 0`**, which the scoped Prisma client now treats as "no store filter" (tenant-wide aggregate). Store management offers a Clone action that copies the default store's overrides + settings to a new store.

**Tech Stack:** Express + TypeScript + Prisma; React + Vite; Vitest; Playwright. Container/web test commands as in prior sub-plans.

## Global Constraints
- All new admin endpoints require `authenticate` + `authorizeAdmin` (tenant admins). `role.middleware` already limits store-scoped roles to the active store; `storeId 0`/all-stores roles pass everywhere (2a).
- **"All stores" = `ctx.storeId 0`** → the scoped client skips the store filter (Task 1). Only meaningful behind role-gated admin routes; customer store-scoped reads are userId-filtered or non-sensitive (recorded as a review item).
- New store creation uses the backend provisioning of a store row; **Clone from default** copies `StoreVariantOverride` rows and the `store_settings` override from the default store.
- `StoreVariantOverride.storeId` and store rows have real FKs. Backward-compat: single-store tenants see one store in the switcher (or it's hidden) and everything looks like today.
- Standard trailers; hand-authored migrations if any.

---

### Task 1: Scoped client treats `ctx.storeId 0` as "no store filter" (deferred from 2a)

**Files:** Modify `backend/src/config/database.ts` (the store-injection branch); Test `backend/src/config/database.tenant.test.ts` (extend).

**Interfaces:** In the `$extends` interceptor, the store-scoped injection currently runs when `ctx.storeId != null`. Change it to run only when `ctx.storeId != null && ctx.storeId !== 0`; when `ctx.storeId === 0`, store-scoped tables filter by `tenantId` only (all stores).

- [ ] **Step 1: Failing test** — under a context with `storeId: 0`, a store-scoped `order.findMany` where clause must NOT contain `storeId` (only `tenantId`); under `storeId: 5` it must contain `storeId: 5`. (Extend the existing extension test; assert via a spy on the base client / the args passed.) Run → FAIL.
- [ ] **Step 2: Implement** the `&& ctx.storeId !== 0` guard on the store-scoped injection (both the read/update/delete `where` branch and any create-stamp branch — for `create`, `storeId 0` should NOT be stamped onto new store-scoped rows; admins creating rows do so under a real store). Run → PASS. Full suite + tsc green.
- [ ] **Step 3: Commit** `feat(phase2e): scoped client treats storeId 0 as all-stores (no store filter)`.

---

### Task 2: `resolveActiveStore` accepts `X-Store-Id: 0` (all stores)

**Files:** Modify `backend/src/middleware/tenant.middleware.ts`; Test `backend/src/middleware/tenant.middleware.test.ts` (extend).

**Interfaces:** When `X-Store-Id === '0'`, set the active store context to `storeId 0` (all stores), `isDefaultStore = false`, without a DB lookup. (Real ids still validated against the tenant as in 2a.) `req.store` is `null` for the all-stores case.

- [ ] **Step 1: Failing test** — `X-Store-Id: '0'` → `ctx.storeId === 0`, `req.store === null`, `next` called; a real foreign id still falls back to default (unchanged). Run → FAIL.
- [ ] **Step 2: Implement** in `resolveActiveStore`/the tail: if `headerStoreId === '0'` return a sentinel `{ id: 0 }` (or set storeId 0 + req.store null) before the numeric-id branch; wire `runWithTenant({ …, storeId: 0, isDefaultStore: false })` and `req.store = null` for that case. Run → PASS. Full suite + tsc green.
- [ ] **Step 3: Commit** `feat(phase2e): X-Store-Id 0 resolves to the all-stores context`.

---

### Task 3: Store management backend (CRUD + Clone from default)

**Files:** Modify `backend/src/services/store.service.ts` (add create/update/setStatus/setDefault/cloneFromDefault); Create `backend/src/controllers/store.controller.ts` additions + `backend/src/routes/store.routes.ts` additions; Test `backend/src/integration/storeManagement.test.ts`.

**Interfaces:** New admin endpoints under `/api/stores`:
- `POST /` `{ name, slug }` → create a store (tenant from context; `isDefault:false`, `status:ACTIVE`); reject duplicate slug per tenant.
- `PATCH /:id` `{ name?, slug?, status? }` → update; `PATCH /:id/default` → make this the tenant's default (unset the previous default in a tx).
- `POST /:id/clone-from-default` → copy every `StoreVariantOverride` of the default store to store `:id` (seed stock+price), and copy the default store's `store_settings` override to `:id`. Idempotent-ish (upsert per variant).
All `authenticate + authorizeAdmin`. Use `getUnscopedPrisma()` with explicit `tenantId` (stores are UNSCOPED) and validate every `:id`/target belongs to the caller's tenant.

- [ ] **Step 1: Failing test** (`storeManagement.test.ts`, real DB): create a second store; make it default (old default unset); clone-from-default copies the default store's overrides to it; a store from another tenant cannot be modified (404). Run → FAIL.
- [ ] **Step 2: Implement** the service methods + controller + routes; the clone reads the default store's overrides (`storeVariantOverride.findMany({ where: { storeId: defaultStoreId } })` via unscoped + tenant check) and upserts them for the target store. Run → PASS. Full suite + tsc green.
- [ ] **Step 3: Commit** `feat(phase2e): store management (create/update/default/clone-from-default)`.

---

### Task 4: Per-store inventory/pricing backend

**Files:** Create `backend/src/services/storeVariantOverride.service.ts` + controller + `backend/src/routes/storeVariantOverride.routes.ts` (mounted e.g. `/api/store-overrides`); Test `backend/src/integration/storeVariantOverride.routes.test.ts`.

**Interfaces:** `authenticate + authorizeAdmin`. `GET /?storeId=` → the store's overrides (+ the base variants so the UI can show effective vs base). `PUT /` `{ storeId, variantId, stock?, priceOverride?, activeOverride? }` → upsert an override (validate storeId + variantId belong to the tenant; storeId must be a real store of the tenant, not 0). `DELETE /?storeId&variantId` → remove an override (revert to base/out-of-stock).

- [ ] **Step 1: Failing test** — upsert an override for (store S, variant V); GET returns it; a variant/store from another tenant is rejected; storeId 0 is rejected (overrides are per real store). Run → FAIL.
- [ ] **Step 2: Implement.** Run → PASS. Full suite + tsc green.
- [ ] **Step 3: Commit** `feat(phase2e): per-store variant override CRUD`.

---

### Task 5: Staff ↔ store assignment backend

**Files:** Modify `backend/src/services/user.service.ts` (or a focused `staffAssignment.service.ts`) + a route; Test extend `backend/src/services/user.service.test.ts` / a routes test.

**Interfaces:** `authenticate + authorizeAdmin`. An endpoint to set a user's role assignments as `{ roleName, storeIds: number[] | 'all' }[]` — writing `UserRole(userId, roleId, storeId)` rows (one per store, or `storeId 0` for `'all'`), replacing that user's existing assignments for those roles in a tx. Validate every storeId belongs to the tenant (or is 0). This is what makes multi-store staff real (2a relaxed the unique to allow it).

- [ ] **Step 1: Failing test** — assign a user EMPLOYEE at stores [S1, S2] → two rows; reassign to `'all'` → one `storeId 0` row (old removed); a foreign store id rejected. Run → FAIL.
- [ ] **Step 2: Implement.** Run → PASS. Full suite + tsc green.
- [ ] **Step 3: Commit** `feat(phase2e): staff↔store assignment (multi-store UserRole)`.

---

### Task 6: Admin frontend — store management, inventory, staff, switcher

**Files (frontend specs — mirror existing website-management + dashboard patterns):**
- `web/src/features/website/pages/StoresPage.jsx` (+ section) — list/create/edit/suspend stores, set default, **Clone from default** button; wired into the website-management sidebar (ADMIN-gated). New store form; on create, offer the Clone action.
- `web/src/services/storesApi.js` — extend with create/update/setDefault/clone.
- Per-store inventory: add a **store selector** to the existing product-management screen; when a non-default store is selected, show per-variant stock/price/active override columns writing through `store-overrides` API. `web/src/services/storeOverridesApi.js` (new).
- Staff↔store: in the user-management screen, a control to pick a user and set role→stores (writes the assignment endpoint). `web/src/services/…` as needed.
- **Admin store switcher**: a header control in the admin shell using `useStoreSelection`, with an extra **"All stores"** option (sends `X-Store-Id: 0`) available to admins only; the store-scoped dashboards (orders, POS, print, reporting) already honor `X-Store-Id`, so they filter/aggregate automatically.
- Tests: component tests for `StoresPage` (list/create/clone), the inventory override editor, and the staff-assignment control (mock the APIs), following the `TenantsPage.test.jsx` pattern.

- [ ] **Step 1:** Build the store-management screen + service; component test (renders list, create calls API, clone calls API). Commit.
- [ ] **Step 2:** Build the per-store inventory editor (store selector + override columns) + service; component test. Commit.
- [ ] **Step 3:** Build the staff↔store assignment control + wiring; component test. Commit.
- [ ] **Step 4:** Build the admin store switcher incl. "All stores"; ensure dashboards read the active store; component test. Commit.
- [ ] Each step: `vite build` clean, touched web tests green.

---

### Task 7: Admin E2E — switcher + staff constraint

**Files:** Create `e2e/flows/admin-multi-store.spec.ts`.

- [ ] **Step 1:** As a tenant admin: create a second store, clone from default, switch the admin store selector between stores and "All stores" — assert the orders/dashboards filter to one store and aggregate under "All stores". As a staff member assigned only to store A: confirm they cannot act on store B (403 / not shown). Mirror `admin`-flow + `tenant-provisioning.spec.ts` patterns. Run → green.
- [ ] **Step 2: Commit** `test(phase2e): admin store switcher + staff constraint e2e`.

---

## After 2e — Phase 2 complete
Run the full backend suite + full E2E (backward-compat gate) + the whole-branch review. Multi-store is then feature-complete: per-store catalog/stock/pricing, settings, delivery, staff, and admin operations, with single-store tenants unchanged throughout.
