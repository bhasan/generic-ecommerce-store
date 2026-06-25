import { test, expect, Page } from '@playwright/test';
import { ACCOUNTS } from '../helpers/accounts';
import { loginViaUI } from '../helpers/auth';

// Regression tests for the AppContext split (refactors_6-25).
// These cover cross-context coordination scenarios that unit tests cannot reach:
// provider ordering, event-listener cleanup across contexts, and localStorage lifecycle.

const CART_STORAGE_KEY = 'cartData_v2';

async function getCartFromLocalStorage(page: Page): Promise<unknown[]> {
  const raw = await page.evaluate((key: string) => localStorage.getItem(key), CART_STORAGE_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw) as unknown[]; } catch { return []; }
}

async function getInStockProduct(page: Page): Promise<{ id: number; name: string }> {
  const res = await page.request.get('http://localhost:3000/api/products');
  const products = await res.json() as Array<{ id: number; name: string; variants?: Array<{ stock: number; active: boolean }> }>;
  const product = products.find(p => p.variants?.some(v => v.stock > 0 && v.active));
  if (!product) throw new Error('No in-stock product found in seed data');
  return { id: product.id, name: product.name };
}

async function addProductToCart(page: Page, productId: number): Promise<void> {
  await page.goto(`/products/${productId}`);
  await expect(page.getByRole('button', { name: 'Add to Cart' })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Add to Cart' }).click();
  // Wait for localStorage to be written
  await page.waitForFunction(
    (key: string) => {
      const raw = localStorage.getItem(key);
      if (!raw) return false;
      try { return (JSON.parse(raw) as unknown[]).length > 0; } catch { return false; }
    },
    CART_STORAGE_KEY,
    { timeout: 5_000 },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Gap 1 — returnPath redirect after authentication
// ─────────────────────────────────────────────────────────────────────────────

test.describe('returnPath redirect', () => {
  // No storageState — tests require unauthenticated starting state

  test('visiting a protected route while logged out sets returnPath and redirects after login', async ({ page }) => {
    // Navigate to a protected route without being authenticated
    await page.goto('/my-orders');
    await page.waitForURL('**/login', { timeout: 8_000 });

    // Log in from the redirect page
    await page.locator('#username').fill(ACCOUNTS.customer.username);
    await page.locator('#password').fill(ACCOUNTS.customer.password);
    await page.getByRole('button', { name: 'Sign In' }).click();

    // Should land back at /my-orders (or /orders), not the default landing
    await page.waitForURL(/\/(my-orders|orders)/, { timeout: 10_000 });
    expect(new URL(page.url()).pathname).toMatch(/\/(my-orders|orders)/);
  });

  test('auth:unauthorized clears returnPath so stale path is not used after re-login', async ({ page }) => {
    // 1. Visit protected route unauthenticated → returnPath = '/my-orders'
    await page.goto('/my-orders');
    await page.waitForURL('**/login', { timeout: 8_000 });

    // 2. Fire auth:unauthorized from the /login page — the fix ensures this clears returnPath
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('auth:unauthorized')));
    await page.waitForTimeout(300); // let React state settle

    // 3. Log in — should NOT redirect to /my-orders (returnPath was cleared)
    await page.locator('#username').fill(ACCOUNTS.customer.username);
    await page.locator('#password').fill(ACCOUNTS.customer.password);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForURL(url => !url.pathname.endsWith('/login'), { timeout: 10_000 });

    // Should land at the default post-login destination, not /my-orders
    expect(new URL(page.url()).pathname).not.toBe('/my-orders');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Gap 2 — Cart cleared when auth:unauthorized fires
// ─────────────────────────────────────────────────────────────────────────────

test.describe('cart cleared on unauthorized', () => {
  test('cart is emptied when auth:unauthorized event fires', async ({ page }) => {
    await loginViaUI(page, ACCOUNTS.customer);

    const product = await getInStockProduct(page);
    await addProductToCart(page, product.id);

    // Confirm cart has item before the event
    const cartBefore = await getCartFromLocalStorage(page);
    expect(cartBefore.length).toBeGreaterThan(0);

    // Simulate session expiry
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('auth:unauthorized')));
    await page.waitForURL('**/login', { timeout: 8_000 });

    // Cart should be cleared immediately — check localStorage directly
    const cartAfter = await getCartFromLocalStorage(page);
    expect(cartAfter.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Gap 3 — Cart survives page refresh (localStorage persistence)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('cart localStorage persistence', () => {
  test.use({ storageState: ACCOUNTS.customer.storageStatePath });

  test('cart items survive a full page reload', async ({ page }) => {
    const product = await getInStockProduct(page);
    await addProductToCart(page, product.id);

    // Full navigation away and back (simulates page refresh scenario)
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.goto('/cart');
    await page.waitForLoadState('networkidle');

    // Product should still appear in the cart UI
    await expect(page.getByText(product.name).first()).toBeVisible({ timeout: 8_000 });

    // And in localStorage
    const cart = await getCartFromLocalStorage(page);
    expect(cart.length).toBeGreaterThan(0);
  });

  test('cart localStorage key is cartData_v2 (not the old key)', async ({ page }) => {
    const product = await getInStockProduct(page);
    await addProductToCart(page, product.id);

    const v2 = await page.evaluate(() => localStorage.getItem('cartData_v2'));
    const legacy = await page.evaluate(() => localStorage.getItem('cart') ?? localStorage.getItem('cartData'));
    expect(v2).not.toBeNull();
    // Legacy key should not carry cart data (would indicate old AppContext path still active)
    expect(legacy).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Gap 5 — Store config loads on /register (unauthenticated)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('store config on unauthenticated routes', () => {
  // No storageState — must be unauthenticated

  test('/register page renders without errors when not logged in', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/register');
    await page.waitForLoadState('networkidle');

    // Register form must be usable — if StoreConfigContext fails to init,
    // the component tree will either throw or the form won't mount
    await expect(page.getByRole('button', { name: 'Create Account' })).toBeVisible({ timeout: 8_000 });

    // No React error boundary messages in console
    const reactErrors = errors.filter(e => e.includes('Uncaught Error') || e.includes('Cannot read properties'));
    expect(reactErrors).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Gap 6 — Cart is empty after successful checkout
// ─────────────────────────────────────────────────────────────────────────────

test.describe('cart cleared after checkout', () => {
  test.use({ storageState: ACCOUNTS.customer.storageStatePath });

  test('cart is empty in localStorage and UI after a successful order', async ({ page }) => {
    const productsRes = await page.request.get('http://localhost:3000/api/products');
    const products = await productsRes.json() as Array<{ id: number; name: string; variants?: Array<{ stock: number; active: boolean }> }>;
    const product = products.find(p => p.name === 'Wireless Headphones') ?? products.find(p => p.variants?.some(v => v.stock > 0 && v.active));
    expect(product).toBeTruthy();

    await page.goto(`/products/${product!.id}`);
    await expect(page.getByRole('button', { name: 'Add to Cart' })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Add to Cart' }).click();

    await page.goto('/cart');
    await page.getByRole('button', { name: 'Proceed to Checkout' }).click();
    await page.waitForURL('**/checkout');

    await page.locator('input[name="paymentMethod"][value="IN_STORE"]').check();
    await page.getByRole('button', { name: 'Place Order' }).click();
    await page.waitForURL('**/order-success', { timeout: 15_000 });
    await expect(page.getByText('Order Placed Successfully!')).toBeVisible();

    // localStorage must be cleared — CartContext clears it on successful checkout
    const cart = await getCartFromLocalStorage(page);
    expect(cart.length).toBe(0);

    // Cart UI must also reflect empty state
    await page.goto('/cart');
    await page.waitForLoadState('networkidle');
    // Empty cart page should not show any product names
    await expect(page.getByText(product!.name)).not.toBeVisible({ timeout: 3_000 });
  });
});
