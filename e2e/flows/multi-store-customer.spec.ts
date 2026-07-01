/**
 * Multi-store customer flow — Phase 2d Task 4
 *
 * Exercises the gating StorePicker modal, per-store price overrides, per-store
 * cart isolation, and order placement at a non-default store.
 *
 * Setup (beforeAll): creates a test product (base price P_A) and a second store
 * (store B) with a StoreVariantOverride giving the variant a different price P_B.
 * The tenant therefore has TWO active stores during this suite.
 *
 * Teardown (afterAll): deletes store B so later specs see a single-store tenant
 * (preserving the customer-order.spec.ts single-store guarantee).
 *
 * ── Product gap note ──────────────────────────────────────────────────────────
 * `StoreSelectionContext` (web/src/context/StoreSelectionContext.jsx) fetches
 * the stores list on mount with an empty dependency array — it does NOT wait for
 * the auth token to be available.  `AuthContext` refreshes the access token on
 * mount in a concurrent async effect (via /api/auth/refresh), creating a race:
 * the stores fetch fires before the Bearer token is set, returns 401, and the
 * context silently falls back to stores=[].  With stores=[], isMultiStore=false
 * and the StorePicker never renders.
 *
 * Workaround in this test: intercept every GET /api/stores request via
 * page.route and inject a fresh customer Bearer token into the Authorization
 * header.  This sends the real request to the real backend and returns real
 * data — we are only fixing the missing header, not faking any response.
 *
 * The fix in production is to gate the stores fetch on isAuthenticated (same
 * pattern CatalogContext already uses) — left for a separate SPA patch.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { test, expect, request } from '@playwright/test';
import { Route } from '@playwright/test';
import { ACCOUNTS } from '../helpers/accounts';
import { establishSession } from '../helpers/auth';
import {
  getDefaultTenantId,
  createTestStore,
  createStoreVariantOverride,
  deleteTestStore,
} from '../helpers/db';

const API = 'http://localhost:3000';

/** Base price visible at the DEFAULT store (store A). */
const P_A = 12.00;
/** Override price visible at store B (StoreVariantOverride). */
const P_B = 27.50;

// ─── Shared state ────────────────────────────────────────────────────────────

let productId: number;
let variantId: number;
let storeAId: number;
let storeAName: string;
let storeBId = 0; // initialised to 0 so afterAll is safe even if beforeAll throws
let storeBName: string;

// ─────────────────────────────────────────────────────────────────────────────

test.describe('Multi-store customer: store picker → per-store prices → per-store cart → order at store B', () => {

  test.beforeAll(async () => {
    // ── 1. Admin login ───────────────────────────────────────────────────────
    const ctx = await request.newContext();

    const loginBody = await (
      await ctx.post(`${API}/api/auth/login`, {
        data: { username: ACCOUNTS.admin.username, password: ACCOUNTS.admin.password },
      })
    ).json();
    const adminToken = loginBody.data.token as string;

    // ── 2. Pick a category ───────────────────────────────────────────────────
    const catsBody = await (
      await ctx.get(`${API}/api/categories`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
    ).json();
    const cats: Array<{ id: number }> = Array.isArray(catsBody) ? catsBody : catsBody.data;
    const catId = cats[0].id;

    // ── 3. Create test product with base price P_A ───────────────────────────
    const prodBody = await (
      await ctx.post(`${API}/api/products`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: {
          name: `Multi-Store Test Product ${Date.now()}`,
          categoryId: catId,
          images: [],
          variants: [
            {
              label: 'Default',
              basePrice: P_A,
              stock: 10,
              stockEnabled: true,
              isDefault: true,
              active: true,
              pricingMode: 'UNIT',
              quantityOptions: [{ quantity: 1, sortOrder: 0 }],
              priceBreaks: [],
            },
          ],
        },
      })
    ).json();

    const product = prodBody.data.product as { id: number; variants: Array<{ id: number }> };
    productId = product.id;
    variantId = product.variants[0].id;

    // ── 4. Create store B (non-default) via direct DB ────────────────────────
    const tenantId = getDefaultTenantId();
    const slug = `ms-store-b-${Date.now()}`;
    storeBName = 'Store B (multi-store test)';
    storeBId = createTestStore(tenantId, slug, storeBName);

    // ── 5. Add price+stock override for store B ──────────────────────────────
    // priceOverride is the 5th param (new optional param; stock-race.spec.ts omits it).
    createStoreVariantOverride(tenantId, storeBId, variantId, /* stock= */ 10, /* priceOverride= */ P_B);

    // ── 6. Resolve default store A from the API ──────────────────────────────
    const storesBody = await (
      await ctx.get(`${API}/api/stores`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
    ).json();
    const stores = (storesBody.data ?? storesBody) as Array<{
      id: number;
      name: string;
      isDefault: boolean;
    }>;
    const storeA = stores.find((s) => s.isDefault);
    if (!storeA) throw new Error('No default store found — seed may not have run');
    storeAId = storeA.id;
    storeAName = storeA.name;

    await ctx.dispose();
  });

  test.afterAll(() => {
    // Always clean up store B so subsequent specs see a single-store tenant.
    // StoreVariantOverride rows cascade-delete via FK.
    if (storeBId > 0) deleteTestStore(storeBId);
  });

  // ─── The flow ──────────────────────────────────────────────────────────────

  test(
    'picks store A, sees P_A; switches to store B, sees P_B and empty cart; places order at B; cart A is restored on switch-back',
    async ({ page, context }) => {
      // Establish an authenticated customer session (fresh context — no persisted store).
      await establishSession(context, ACCOUNTS.customer);

      // ── Workaround for auth-race in StoreSelectionContext ─────────────────
      // Mint a customer bearer token to inject into every GET /api/stores
      // request so the stores endpoint always sees a valid auth header.
      // (See the product-gap note at the top of this file.)
      const tokenCtx = await request.newContext();
      const tokenResp = await tokenCtx.post(`${API}/api/auth/login`, {
        data: { username: ACCOUNTS.customer.username, password: ACCOUNTS.customer.password },
      });
      const { data: { token: storesAuthToken } } = await tokenResp.json();
      await tokenCtx.dispose();

      // Intercept GET /api/stores; add Authorization header and proxy to real backend.
      const storesRouteHandler = async (route: Route) => {
        const response = await route.fetch({
          headers: {
            ...route.request().headers(),
            Authorization: `Bearer ${storesAuthToken}`,
          },
        });
        await route.fulfill({ response });
      };
      await page.route('**/api/stores', storesRouteHandler);

      // ── Step 2: StorePicker appears for multi-store tenant ─────────────────
      await page.goto('/products');

      const pickerHeading = page.getByRole('heading', { name: 'Choose your location' });
      await expect(pickerHeading).toBeVisible({ timeout: 15_000 });

      // Pick store A by clicking its name button inside the picker.
      await page.getByRole('button', { name: storeAName }).click();

      // Modal must close.
      await expect(pickerHeading).not.toBeVisible({ timeout: 5_000 });

      // ── Step 3: Product page shows P_A for store A ─────────────────────────
      await page.goto(`/products/${productId}`);
      const priceDisplay = page.locator('.product-price-display');
      await expect(priceDisplay).toBeVisible({ timeout: 10_000 });
      await expect(priceDisplay).toContainText(`$${P_A.toFixed(2)}`);

      // Add to cart (store A's cart).
      await page.getByRole('button', { name: 'Add to Cart' }).click();

      // Verify store A's cart is non-empty.
      await page.goto('/cart');
      await expect(page.getByText('Your cart is empty')).not.toBeVisible({ timeout: 5_000 });
      await expect(page.locator('.cart-item-name').first()).toBeVisible();

      // ── Step 4: Switch to store B via StoreSwitcher ────────────────────────
      // Navigate to products page where the header StoreSwitcher is available.
      await page.goto('/products');

      // Open the switcher dropdown (aria-label identifies the current active store).
      const switcherBtn = page.getByRole('button', { name: /Current store:/ });
      await expect(switcherBtn).toBeVisible({ timeout: 5_000 });
      await switcherBtn.click();

      // Select store B from the dropdown.
      const storeBOption = page.getByRole('option', { name: storeBName });
      await expect(storeBOption).toBeVisible({ timeout: 5_000 });
      await storeBOption.click();

      // ── Step 4 cont: product page now shows P_B (override price) ─────────
      // Full page.goto triggers a fresh SPA load with selectedStoreId=storeBId in
      // localStorage → CatalogContext fetches with X-Store-Id=storeBId → override applies.
      await page.goto(`/products/${productId}`);
      await expect(priceDisplay).toBeVisible({ timeout: 10_000 });
      await expect(priceDisplay).toContainText(`$${P_B.toFixed(2)}`, { timeout: 10_000 });

      // ── Step 4 cont: store B's cart is empty (separate per-store cart) ────
      await page.goto('/cart');
      await expect(page.getByText('Your cart is empty')).toBeVisible({ timeout: 5_000 });

      // ── Step 5: Place an order under store B ──────────────────────────────
      // Add product to store B's cart.
      await page.goto(`/products/${productId}`);
      await expect(priceDisplay).toContainText(`$${P_B.toFixed(2)}`, { timeout: 10_000 });
      await page.getByRole('button', { name: 'Add to Cart' }).click();

      // Proceed through checkout.
      await page.goto('/cart');
      await expect(page.getByText('Your cart is empty')).not.toBeVisible({ timeout: 5_000 });
      await page.getByRole('button', { name: 'Proceed to Checkout' }).click();
      await page.waitForURL('**/checkout');

      await page.locator('input[name="paymentMethod"][value="IN_STORE"]').check();
      await page.getByRole('button', { name: 'Place Order' }).click();
      await page.waitForURL('**/order-success', { timeout: 15_000 });
      await expect(page.getByRole('heading', { name: 'Order Placed Successfully!' })).toBeVisible();

      // Capture the order id from the success page.
      const orderIdText = await page.locator('.order-id-number').textContent();
      expect(orderIdText).toBeTruthy();
      const rawOrderId = parseInt(orderIdText!.replace('#', '').trim(), 10);
      expect(rawOrderId).toBeGreaterThan(0);

      // ── Step 5 cont: verify order has storeId=B and unitPrice=P_B via API ─
      const custCtx = await request.newContext();
      const custLoginBody = await (
        await custCtx.post(`${API}/api/auth/login`, {
          data: {
            username: ACCOUNTS.customer.username,
            password: ACCOUNTS.customer.password,
          },
        })
      ).json();
      const custToken = custLoginBody.data.token as string;

      // Orders are STORE_SCOPED: the scoped Prisma client filters by storeId.
      // Must include X-Store-Id: storeBId to look up an order placed at store B.
      const orderRes = await custCtx.get(`${API}/api/orders/${rawOrderId}`, {
        headers: {
          Authorization: `Bearer ${custToken}`,
          'X-Store-Id': String(storeBId),
        },
      });
      expect(orderRes.ok(), `GET /api/orders/${rawOrderId} failed: ${orderRes.status()}`).toBe(true);
      const orderBody = await orderRes.json();
      const order = orderBody.data;

      // storeId must match store B.
      expect(order.storeId).toBe(storeBId);

      // First line item's unitPrice must equal P_B (the override price).
      const lineItem = order.items[0];
      expect(Number(lineItem.unitPrice)).toBeCloseTo(P_B, 2);

      await custCtx.dispose();

      // ── Step 6 (optional): switch back to A — A's cart is restored ────────
      await page.goto('/products');

      const switcherBtnB = page.getByRole('button', { name: /Current store:/ });
      await expect(switcherBtnB).toBeVisible({ timeout: 5_000 });
      await switcherBtnB.click();

      const storeAOption = page.getByRole('option', { name: storeAName });
      await expect(storeAOption).toBeVisible({ timeout: 5_000 });
      await storeAOption.click();

      // A's cart should be restored with the item we added earlier.
      await page.goto('/cart');
      await expect(page.getByText('Your cart is empty')).not.toBeVisible({ timeout: 5_000 });
      await expect(page.locator('.cart-item-name').first()).toBeVisible();

      // Clean up the route interceptor.
      await page.unroute('**/api/stores', storesRouteHandler);
    },
  );
});
