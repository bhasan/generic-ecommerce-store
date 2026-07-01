# Multi-Tenancy Phase 2d — Store Picker (customer) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Let a customer of a multi-store tenant pick their store (location), have every API call carry that selection (`X-Store-Id`), see that store's catalog/prices/stock (from 2c), and keep a **separate cart per store**. Single-store tenants auto-select their one store — no picker, unchanged experience.

**Architecture:** A new `StoreSelectionContext` (active store id in `localStorage`, the store list from `GET /api/stores`) composed into `AppContext`. The shared API client (`web/src/services/api.js`) attaches `X-Store-Id`. A "choose your location" picker (modal on first visit for multi-store; header switcher to change) sets it. `CartContext` keys its `localStorage` by the active store (separate cart per store) with a 7-day TTL. Changing store re-fetches the catalog (2c effective values) and loads that store's cart.

**Tech Stack:** React + Vite, Vitest (web), Playwright. Web tests: `cd web && npx vitest run <path>`; build `cd web && npx vite build --outDir dist-verify` (then remove it).

## Global Constraints
- **Single-store tenants unchanged:** `GET /api/stores` returns one store → auto-select it, never show the picker, cart behaves as today.
- **Separate cart per store** (decision): each store has its own cart in `localStorage`; switching to store B shows B's cart; switching back to A restores A's. Each cart independently carries a `savedAt` and is cleared after **7 days**.
- API calls go through `web/src/services/api.js` (don't `fetch` from components). Follow existing context patterns (`src/context/*`, composed in `AppContext.jsx`).
- Backward compat: no selection yet / single store → the backend already falls back to the default store (2a), so the app works before/without a selection.

---

### Task 1: `StoreSelectionContext` + persistence + `X-Store-Id`

**Files:** Create `web/src/context/StoreSelectionContext.jsx`; Modify `web/src/context/AppContext.jsx` (compose it); Modify `web/src/services/api.js` (attach header); Create `web/src/services/storesApi.js` (`getStores()` → `GET /api/stores`); Test `web/src/context/StoreSelectionContext.test.jsx`.

**Interfaces:** `useStoreSelection()` → `{ stores, activeStoreId, isMultiStore, selectStore(id), loading }`. `activeStoreId` persists to `localStorage['selectedStoreId']`. On mount: `getStores()`; if exactly one store → auto-select it; if the persisted id isn't in the list → clear it. The API client reads `localStorage['selectedStoreId']` and, when present, adds header `X-Store-Id: <id>`.

- [ ] **Step 1: Failing tests** — `StoreSelectionContext.test.jsx`: (a) single store → `activeStoreId` auto-set, `isMultiStore=false`; (b) multiple stores + no persisted id → `activeStoreId=null`, `isMultiStore=true`; (c) `selectStore(id)` sets it + writes localStorage; (d) a persisted id not in the returned list is cleared. Mock `storesApi.getStores`. Run → FAIL.
- [ ] **Step 2: Implement** the context + `storesApi.getStores` (use the `get` helper from `./api`), compose in `AppContext`, and in `api.js` (around the header block ~line 174) add `const sid = localStorage.getItem('selectedStoreId'); if (sid) headers['X-Store-Id'] = sid;`.
- [ ] **Step 3:** Tests green; `vite build` clean. Commit `feat(phase2d): store selection context + X-Store-Id header`.

---

### Task 2: Store picker UI (modal on entry) + header switcher

**Files:** Create `web/src/features/store/StorePicker.jsx` (+ css); Create `web/src/features/store/StoreSwitcher.jsx`; Modify the app shell (`web/src/App.jsx` or the layout/header component) to render them; Test `web/src/features/store/StorePicker.test.jsx`.

**Interfaces:** `StorePicker` — shown (modal) when `isMultiStore && !activeStoreId`; lists stores (name), calls `selectStore(id)` on choose, then dismisses. `StoreSwitcher` — a header control visible only when `isMultiStore`, showing the active store name and letting the customer change it (which triggers the switch flow in Task 3). Single-store: neither renders.

- [ ] **Step 1: Failing tests** — `StorePicker.test.jsx`: renders the store list when multi-store + no selection; clicking a store calls `selectStore`; does not render for a single store or once a store is selected. Run → FAIL.
- [ ] **Step 2: Implement** following existing feature/component + modal patterns (reuse `BaseModal` if present). Wire into the shell so the modal gates the storefront for multi-store visitors without a selection.
- [ ] **Step 3:** Tests green; build clean. Commit `feat(phase2d): store picker modal + header switcher`.

---

### Task 3: Per-store cart + switch flow + catalog refetch

**Files:** Modify `web/src/context/CartContext.jsx` (key storage by active store; 7-day TTL); Modify `web/src/context/CatalogContext.jsx` (refetch on store change); Modify `StoreSwitcher`/selection to trigger the switch; Test `web/src/context/CartContext.test.jsx` (extend).

**Interfaces:** Cart storage key becomes `cartData_v2_store_${activeStoreId}` (fallback `cartData_v2` when no active store — single-store/legacy). The stored shape gains `savedAt` (timestamp); on load, if `now - savedAt > 7 days`, treat as empty and clear that key. Switching the active store: the cart context swaps to the new store's stored cart (separate carts, no clearing of the old); the catalog context re-fetches products (so 2c effective prices/stock for the new store load).

- [ ] **Step 1: Failing tests** — `CartContext.test.jsx`: (a) items saved under store A are NOT visible when the active store is B, and re-appear when switching back to A; (b) a cart whose `savedAt` is >7 days old loads empty and its key is removed; (c) `savedAt` is written on save. Drive the active store via the mocked `useStoreSelection`. Run → FAIL.
- [ ] **Step 2: Implement** the per-store keying + TTL in `CartContext` (read `activeStoreId` from `useStoreSelection`; re-init cart state when it changes). Trigger `CatalogContext` refetch on `activeStoreId` change (a `useEffect` dependency). Keep single-store behavior identical (one key, no visible change).
- [ ] **Step 3:** Tests green; build clean. Commit `feat(phase2d): separate cart per store (7-day TTL) + catalog refetch on switch`.

---

### Task 4: Multi-store customer E2E

**Files:** Create `e2e/flows/multi-store-customer.spec.ts`; may extend `e2e/helpers/` for a two-store seed (or seed via API using a super-admin token to create a second store + an override).

**Interfaces:** Establish a tenant with two stores where a variant has different stock/price per store (create the second store + a `StoreVariantOverride` via API, or a dedicated seed). Then: as a customer, pick store A → see A's price/stock → add to cart; switch to store B → see B's (different) price/stock and B's (separate) cart; place an order under B → the order lands at store B with B's price. Assert the picker does NOT appear for a single-store tenant (the existing customer-order flow still passes).

- [ ] **Step 1:** Write the spec mirroring `e2e/flows/customer-order.spec.ts` + the `X-Store-Id`/picker interactions; wire any seed helper. Run → green.
- [ ] **Step 2: Commit** `test(phase2d): multi-store customer picker + per-store cart e2e`.

---

## After 2d
Full web suite + full E2E green (single-store unchanged). Then **2e (admin UIs)**.
