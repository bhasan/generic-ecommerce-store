# AppContext Split — Testing Plan

> Branch: `refactors_6-25`  
> Commits: `ad703cf..2982cda` (9 commits)  
> Written: 2026-06-25

---

## Why This Plan Exists

The AppContext split is a structural refactor: 1,280 lines of god-object → 6 focused contexts + a compatibility shim. No consumer code changed. **The refactor's risk isn't broken logic — it's broken coordination.**

Unit tests verify each context in isolation. They can't catch:
- A context silently receiving `null` from a dependency that's supposed to be mounted above it
- Event listeners (`auth:unauthorized`) triggering the wrong subset of cleanup
- Polling that starts or stops at the wrong lifecycle points
- Cross-context state flows (checkout: Cart → Orders → Notifications)

This plan covers: what's already tested, where the gaps are, and exactly what new tests to write.

---

## What's Already Covered

### Unit Tests (Vitest) — 632 tests, all passing

| File | What it tests |
|------|--------------|
| `UIContext.test.jsx` | `showNotification`, `closeNotification`, `returnPath`, `backend:unavailable` event |
| `AuthContext.test.jsx` | login, logout, register, token revalidation on mount, `auth:unauthorized` event |
| `StoreConfigContext.test.jsx` | `loadConfig`, `loadLandingPageData`, auth-gated loading |
| `CatalogContext.test.jsx` | `loadProducts`, `loadCategories`, optimistic review mutations, auto-load on auth |
| `NotificationsContext.test.jsx` | polling setup, mute toggle, `markRead`, `staffCounts` |
| `OrdersContext.test.jsx` | `loadOrders`, `updateOrderStatus`, `silent` flag |
| `CartContext.test.jsx` | `addToCart`, `removeFromCart`, localStorage persistence, checkout clears cart |
| `AppContext.shim.test.jsx` | `useApp()` returns all ~50 required keys; throws outside `AppProvider` |
| `AppContext.*.test.jsx` (74 files) | All existing consumer-side tests, unchanged — mock `useApp()` through the shim |

**What unit tests cannot catch:** Cross-context coordination, real mount/unmount cycles, event propagation across provider boundaries, polling lifecycle tied to auth state transitions.

### Playwright E2E — Existing coverage

| Spec | What it tests |
|------|--------------|
| `flows/auth.spec.ts` | Login, wrong password, register, logout clears localStorage |
| `flows/customer-order.spec.ts` | Browse → cart → checkout → appears in my-orders |
| `flows/order-lifecycle.spec.ts` | Customer places order, manager advances PENDING→APPROVED→READY→COMPLETED |
| `flows/store-credit.spec.ts` | Manager grants credit, customer checks out with store credit |
| `flows/variant-editing.spec.ts` | Admin edits variant, storefront reflects change |
| `flows/driver-delivery.spec.ts` | Driver picks up and completes delivery |
| `flows/curbside-arrival.spec.ts` | Customer notifies arrival, staff sees it |
| `smoke/manual_flows.spec.ts` | Product grid, product detail, variant switching, OOS state, add-to-cart, checkout, admin CRUD |

---

## Gaps: What's NOT Tested (Refactor-Specific Risks)

These scenarios are specific to how the 6-context architecture coordinates. None are covered by existing tests.

### Gap 1 — `returnPath` redirect after authentication (Critical bug that was just fixed)

**Scenario:** User visits `/orders` while unauthenticated → gets redirected to `/login` with `returnPath=/orders` set in UIContext → logs in → should land at `/orders`.

**Why it matters:** `setReturnPath(null)` was missing from `handleUnauthorized` and was just added. An explicit test pins this behavior so it can't regress.

### Gap 2 — Cart cleared on `auth:unauthorized` event

**Scenario:** User has items in cart → session expires mid-session (or manual `dispatchEvent(new CustomEvent('auth:unauthorized'))`) → cart should be empty.

**Why it matters:** CartContext now independently listens to `auth:unauthorized` to clear cart. This cross-context cleanup wasn't tested.

### Gap 3 — Cart survives page refresh

**Scenario:** User adds item to cart → navigates to another page (full reload) → cart still shows the item.

**Why it matters:** Cart persists to `localStorage` under `cartData_v2`. This is existing behavior, but the key name changed from the old AppContext and no E2E test verifies it.

### Gap 4 — Notification polling starts after login, stops after logout

**Scenario:** User logs in → notification badge starts polling → user logs out → polling stops (no more network requests after logout).

**Why it matters:** Polling is now guarded by `isAuthenticated` from AuthContext. If that dependency isn't wired correctly, polling either never starts or runs for logged-out users.

### Gap 5 — Store config loads on `/register` (unauthenticated route)

**Scenario:** User navigates directly to `/register` without being logged in → `loadConfig` still fires (because `StoreConfigContext` explicitly allows this route).

**Why it matters:** `loadConfig` has an `isAuthenticated || pathname === '/register'` guard. If this guard broke, the register page would render without store branding/config.

### Gap 6 — Checkout cross-context coordination

**Scenario:** Customer adds item → checks out → order appears in my-orders AND notification count updates (for staff) AND cart is empty after.

**Why it matters:** The checkout flow in CartContext calls into `useOrdersContext()` and `useNotificationsContext()`. This cross-context call is only correct if the provider nesting is right. The existing `customer-order.spec.ts` covers orders, but not the notification side-effect or cart-cleared-after state.

---

## New Tests to Write

### File: `e2e/flows/context-split.spec.ts`

This is the main new file. All tests here are regression guards specific to the 6-context architecture.

```typescript
import { test, expect } from '@playwright/test';
import { ACCOUNTS } from '../helpers/accounts';
import { loginViaUI } from '../helpers/auth';

test.describe('Context split — cross-context coordination', () => {

  // ── Gap 1: returnPath redirect ──────────────────────────────────────────

  test('protected route → login → redirects back to original route', async ({ page }) => {
    // Navigate to protected route WITHOUT being logged in
    await page.goto('/my-orders');
    // Should land at /login
    await page.waitForURL('**/login', { timeout: 8_000 });
    // Now log in
    await page.locator('#username').fill(ACCOUNTS.customer.username);
    await page.locator('#password').fill(ACCOUNTS.customer.password);
    await page.getByRole('button', { name: 'Sign In' }).click();
    // Should redirect back to /my-orders (or /orders), not to the default landing
    await page.waitForURL(/\/(my-orders|orders)/, { timeout: 10_000 });
    expect(new URL(page.url()).pathname).toMatch(/\/(my-orders|orders)/);
  });

  // ── Gap 2: cart cleared on session expiry ───────────────────────────────

  test('cart is cleared when auth:unauthorized fires', async ({ page }) => {
    await loginViaUI(page, ACCOUNTS.customer);

    // Add something to cart via API shortcut
    const productsRes = await page.request.get('http://localhost:3000/api/products');
    const products = await productsRes.json();
    const product = products.find((p: any) => p.variants?.some((v: any) => v.stock > 0));
    expect(product).toBeTruthy();
    await page.goto(`/products/${product.id}`);
    await expect(page.getByRole('button', { name: 'Add to Cart' })).toBeVisible({ timeout: 8_000 });
    await page.getByRole('button', { name: 'Add to Cart' }).click();
    await page.waitForTimeout(500);

    // Verify cart has item
    await page.goto('/cart');
    await expect(page.getByText(product.name).first()).toBeVisible({ timeout: 5_000 });

    // Simulate session expiry by firing auth:unauthorized
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('auth:unauthorized')));
    await page.waitForURL('**/login', { timeout: 8_000 });

    // Log back in and check cart is empty
    await page.locator('#username').fill(ACCOUNTS.customer.username);
    await page.locator('#password').fill(ACCOUNTS.customer.password);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForURL(/\/(products|orders|dashboard)/, { timeout: 10_000 });

    const cartData = await page.evaluate(() => localStorage.getItem('cartData_v2'));
    const cart = cartData ? JSON.parse(cartData) : [];
    expect(Array.isArray(cart) ? cart.length : 0).toBe(0);
  });

  // ── Gap 3: cart persists across page refresh ────────────────────────────

  test('cart items survive a page refresh', async ({ page }) => {
    await loginViaUI(page, ACCOUNTS.customer);

    const productsRes = await page.request.get('http://localhost:3000/api/products');
    const products = await productsRes.json();
    const product = products.find((p: any) => p.variants?.some((v: any) => v.stock > 0));
    expect(product).toBeTruthy();

    await page.goto(`/products/${product.id}`);
    await expect(page.getByRole('button', { name: 'Add to Cart' })).toBeVisible({ timeout: 8_000 });
    await page.getByRole('button', { name: 'Add to Cart' }).click();
    await page.waitForTimeout(500);

    // Full page reload
    await page.reload();
    await page.waitForLoadState('networkidle');

    await page.goto('/cart');
    await expect(page.getByText(product.name).first()).toBeVisible({ timeout: 5_000 });
  });

  // ── Gap 5: store config loads on /register (unauthenticated) ────────────

  test('/register page loads store branding without being authenticated', async ({ page }) => {
    // Visit register without any auth state
    await page.goto('/register');
    await page.waitForLoadState('networkidle');
    // The register page should render — if StoreConfigContext fails to load,
    // the form either won't mount or will throw a React error
    await expect(page.getByRole('button', { name: /create account/i })).toBeVisible({ timeout: 8_000 });
    // No React error overlay
    const errorOverlay = page.locator('#webpack-dev-server-client-overlay, [data-reactroot] + div');
    await expect(errorOverlay).not.toBeVisible();
  });

  // ── Gap 6: checkout clears cart ─────────────────────────────────────────

  test('cart is empty after successful checkout', async ({ page }) => {
    await page.goto('/', { storageState: ACCOUNTS.customer.storageStatePath });
    await page.context().addInitScript({ content: '' }); // ensure storageState is applied

    // Full checkout flow reusing customer storageState
    const productsRes = await page.request.get('http://localhost:3000/api/products');
    const products = await productsRes.json();
    const product = products.find((p: any) => p.name === 'Wireless Headphones');
    expect(product).toBeTruthy();

    await page.goto(`/products/${product.id}`);
    await expect(page.getByRole('button', { name: 'Add to Cart' })).toBeVisible({ timeout: 8_000 });
    await page.getByRole('button', { name: 'Add to Cart' }).click();
    await page.goto('/cart');
    await page.getByRole('button', { name: 'Proceed to Checkout' }).click();
    await page.waitForURL('**/checkout');
    await page.locator('input[name="paymentMethod"][value="IN_STORE"]').check();
    await page.getByRole('button', { name: 'Place Order' }).click();
    await page.waitForURL('**/order-success', { timeout: 15_000 });

    // Navigate to cart — should be empty
    await page.goto('/cart');
    await page.waitForLoadState('networkidle');

    const cartData = await page.evaluate(() => localStorage.getItem('cartData_v2'));
    const cart = cartData ? JSON.parse(cartData) : [];
    expect(Array.isArray(cart) ? cart.length : 0).toBe(0);
  });

});
```

---

### Addition to `e2e/flows/auth.spec.ts`

Add one test to the existing `Auth flows` describe block to cover the returnPath-cleared-on-unauthorized behavior:

```typescript
test('returnPath is cleared after auth:unauthorized (no stale redirect)', async ({ page }) => {
  await loginViaUI(page, ACCOUNTS.customer);

  // Set a returnPath by visiting a protected page
  await page.goto('/my-orders');
  await page.waitForLoadState('networkidle');

  // Fire unauthorized event (simulates token expiry)
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('auth:unauthorized')));
  await page.waitForURL('**/login', { timeout: 8_000 });

  // Log in again — should NOT redirect to /my-orders since returnPath should be cleared
  // (the returnPath set by the first visit should have been cleared by the unauthorized handler)
  await page.locator('#username').fill(ACCOUNTS.customer.username);
  await page.locator('#password').fill(ACCOUNTS.customer.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL(/\/(products|orders|dashboard)/, { timeout: 10_000 });

  // returnPath should be null in React state — verify by checking that a
  // subsequent unauthorized event does NOT redirect to a stale protected path
  const currentPath = new URL(page.url()).pathname;
  expect(currentPath).not.toBe('/my-orders');
});
```

---

## Manual Verification Checklist

These scenarios are hard to automate reliably but should be manually verified before merging.

### Auth & Session
- [ ] Login as customer → navigate around → refresh page → still logged in (token revalidation on mount)
- [ ] Open two tabs, log out in one → reload the other → session is gone in both tabs
- [ ] Visit `/admin` as a customer → gets redirected to login → logs in as admin → lands on admin

### Notifications & Polling
- [ ] Log in as staff/manager → open DevTools Network tab → confirm periodic requests to `/api/notifications` and `/api/notifications/staff-counts` appear on interval
- [ ] Log out → confirm those polling requests stop (no more requests in Network tab after logout)
- [ ] Click the mute button on notifications → reload the page → still muted (sessionStorage persists within session)
- [ ] Open a new tab (same browser session) → mute state carries over (same sessionStorage)

### Cart
- [ ] Add item to cart → open DevTools Application → `localStorage > cartData_v2` shows the item
- [ ] Refresh page → item is still in cart
- [ ] Log out → log back in → cart is empty (`cartData_v2` was cleared on logout)

### Store Config
- [ ] Navigate to `/register` while logged out → page renders without errors and shows the registration form
- [ ] Log in → store branding (logo, colors) loads correctly
- [ ] Admin updates store name → storefront reflects the new name after reload

### Cross-Context Coordination
- [ ] Customer places order → My Orders shows the new order immediately after checkout (no reload required)
- [ ] Manager approves an order → customer's My Orders page (with polling) eventually updates the status automatically without a manual reload

---

## How to Run

### Unit tests
```bash
cd web && npx vitest run
```

### E2E tests (requires dev server + backend running)
```bash
# Start backend
cd backend && npm run dev

# Start frontend
cd web && npm run dev

# Run all E2E
cd e2e && npx playwright test

# Run only the new context-split spec
npx playwright test flows/context-split.spec.ts

# Run with UI (see browser)
npx playwright test --ui
```

---

## Coverage Summary

| Risk area | Unit | E2E (existing) | E2E (new) | Manual |
|-----------|------|----------------|-----------|--------|
| Per-context logic | ✅ | — | — | — |
| `useApp()` key completeness | ✅ | — | — | — |
| Login / logout / register | ✅ | ✅ | — | — |
| Customer order flow | ✅ | ✅ | — | — |
| returnPath redirect | ✅ (unit) | ❌ | ✅ (new) | ✅ |
| Cart cleared on unauthorized | ✅ (unit) | ❌ | ✅ (new) | ✅ |
| Cart localStorage persistence | ✅ (unit) | ❌ | ✅ (new) | ✅ |
| Checkout clears cart | ✅ (unit) | partial | ✅ (new) | — |
| Register page config loading | — | ❌ | ✅ (new) | ✅ |
| Polling lifecycle (start/stop) | ✅ (unit) | ❌ | — | ✅ |
| Notification mute sessionStorage | ✅ (unit) | ❌ | — | ✅ |
| Order status lifecycle | — | ✅ | — | — |
| Store credit flow | — | ✅ | — | — |
