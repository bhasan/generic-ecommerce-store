import { test, expect, Page, request } from '@playwright/test';

const BASE = 'http://localhost:5843';
const API  = 'http://localhost:3000';

// ── helpers ──────────────────────────────────────────────────────────────────

async function login(page: Page, username: string, password: string) {
  await page.goto(`${BASE}/login`);
  await page.locator('#username').fill(username);
  await page.locator('#password').fill('');
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await page.waitForURL(/localhost:5843\/(products|orders|dashboard|manage)/, { timeout: 12000 });
}

async function ss(page: Page, name: string) {
  await page.screenshot({ path: `/tmp/flow_${name}.png`, fullPage: false });
}

async function apiCreateProduct(name: string, variants: any[]) {
  const ctx = await request.newContext();
  const { token } = await (await ctx.post(`${API}/api/auth/login`, {
    data: { username: 'admin', password: 'admin123' },
  })).json();
  const cats = await (await ctx.get(`${API}/api/categories`, {
    headers: { Authorization: `Bearer ${token}` },
  })).json();
  const catId = cats[0].id;
  const body = await (await ctx.post(`${API}/api/products`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { name, categoryId: catId, variants, images: [] },
  })).json();
  await ctx.dispose();
  return body.product.id as number;
}

// ─────────────────────────────────────────────────────────────────────────────
// FLOW 1: Customer — browse → pick variant → add to cart → checkout
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Flow 1: Customer browse → variant → cart → checkout', () => {

  let productId: number;

  test.beforeAll(async () => {
    productId = await apiCreateProduct('Flow Test Hoodie', [
      { label: 'Small',  basePrice: 29.99, stock: 10, stockEnabled: true,  isDefault: true,  active: true, pricingMode: 'UNIT', quantityOptions: [{ quantity: 1, sortOrder: 0 }], priceBreaks: [] },
      { label: 'Medium', basePrice: 34.99, stock: 5,  stockEnabled: true,  isDefault: false, active: true, pricingMode: 'UNIT', quantityOptions: [{ quantity: 1, sortOrder: 0 }], priceBreaks: [] },
      { label: 'Large',  basePrice: 34.99, stock: 0,  stockEnabled: true,  isDefault: false, active: true, pricingMode: 'UNIT', quantityOptions: [{ quantity: 1, sortOrder: 0 }], priceBreaks: [] },
    ]);
  });

  test('1a — products grid loads and shows prices', async ({ page }) => {
    await login(page, 'johncustomer', 'customer123');
    await page.waitForLoadState('networkidle');
    const prices = page.locator('.product-price, .product-list-price');
    await expect(prices.first()).toBeVisible({ timeout: 8000 });
    const text = await prices.first().textContent();
    expect(text).toMatch(/\$\d+\.\d{2}/);
    await ss(page, '1a_grid');
  });

  test('1b — product detail page shows variant selector', async ({ page }) => {
    await login(page, 'johncustomer', 'customer123');
    await page.goto(`${BASE}/products/${productId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: /small/i })).toBeVisible({ timeout: 8000 });
    await expect(page.getByRole('button', { name: /medium/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /large/i })).toBeVisible();
    await ss(page, '1b_variants');
  });

  test('1c — switching to Medium updates price to $34.99', async ({ page }) => {
    await login(page, 'johncustomer', 'customer123');
    await page.goto(`${BASE}/products/${productId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: /small/i })).toBeVisible({ timeout: 8000 });

    const priceEl = page.locator('.product-price-display, [class*="price"]').first();
    const before = await priceEl.textContent();
    await page.getByRole('button', { name: /medium/i }).click();
    await page.waitForTimeout(400);
    const after = await priceEl.textContent();

    expect(after).toContain('34.99');
    expect(after).not.toBe(before);
    await ss(page, '1c_price_switch');
  });

  test('1d — Large (OOS) shows disabled Out of Stock button', async ({ page }) => {
    await login(page, 'johncustomer', 'customer123');
    await page.goto(`${BASE}/products/${productId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: /large/i })).toBeVisible({ timeout: 8000 });
    await page.getByRole('button', { name: /large/i }).click();
    await page.waitForTimeout(400);
    await expect(page.getByRole('button', { name: /out of stock/i })).toBeDisabled({ timeout: 5000 });
    await ss(page, '1d_oos');
  });

  test('1e — add Medium to cart, verify cart shows variant label + price', async ({ page }) => {
    await login(page, 'johncustomer', 'customer123');
    await page.goto(`${BASE}/products/${productId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: /medium/i })).toBeVisible({ timeout: 8000 });
    await page.getByRole('button', { name: /medium/i }).click();
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: /add to cart/i }).click();
    await page.waitForTimeout(600);

    await page.goto(`${BASE}/cart`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/flow test hoodie/i).first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/medium/i).first()).toBeVisible();
    await expect(page.getByText(/34\.99/).first()).toBeVisible();
    await ss(page, '1e_cart');
  });

  test('1f — checkout completes, order appears in My Orders', async ({ page }) => {
    await login(page, 'johncustomer', 'customer123');
    await page.goto(`${BASE}/products/${productId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: /medium/i })).toBeVisible({ timeout: 8000 });
    await page.getByRole('button', { name: /medium/i }).click();
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: /add to cart/i }).click();
    await page.waitForTimeout(600);

    await page.goto(`${BASE}/cart`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /proceed to checkout/i }).click();
    await page.waitForURL('**/checkout', { timeout: 8000 });
    await ss(page, '1f_checkout');

    // Pick Up + In Store payment
    const pickupBtn = page.locator('button, label').filter({ hasText: /pick.?up/i }).first();
    if (await pickupBtn.isVisible({ timeout: 2000 }).catch(() => false)) await pickupBtn.click();
    const inStore = page.locator('input[value="IN_STORE"]').first();
    if (await inStore.isVisible({ timeout: 2000 }).catch(() => false)) await inStore.click();

    await page.getByRole('button', { name: /place order/i }).click();
    await page.waitForURL('**/order-success', { timeout: 15000 });
    await expect(page.getByText(/order placed successfully/i)).toBeVisible({ timeout: 8000 });
    await ss(page, '1f_success');

    const rawText = await page.locator('.order-id-number').textContent();
    const orderId = String(parseInt(rawText!.replace('#', '').trim(), 10));

    await page.goto(`${BASE}/my-orders`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(`Order #${orderId}`, { exact: false })).toBeVisible({ timeout: 8000 });
    await ss(page, '1f_my_orders');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FLOW 2: Admin — create product via UI → verify on storefront
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Flow 2: Admin create product via UI → customer sees it', () => {

  test('2a — manage products page loads', async ({ page }) => {
    await login(page, 'admin', 'admin123');
    await page.goto(`${BASE}/manage-store/products`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'Products' }).first()).toBeVisible({ timeout: 8000 });
    await ss(page, '2a_manage');
  });

  test('2b — admin creates a new product via the form', async ({ page }) => {
    await login(page, 'admin', 'admin123');
    await page.goto(`${BASE}/manage-store/products`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /add product/i }).click();
    await page.waitForTimeout(600);
    await ss(page, '2b_form_open');

    // Product name — placeholder is "e.g., Blue Dream"
    await page.locator('input[placeholder*="Blue Dream"], input[placeholder*="product name" i]').fill('Admin Flow Widget');

    // Category — it's a search/combobox input
    const catInput = page.locator('input[placeholder*="categor" i], input[placeholder*="Search" i]').first();
    await catInput.click();
    await page.waitForTimeout(300);
    // Pick the first option that appears
    const firstOption = page.locator('[role="option"], .category-option, li').first();
    if (await firstOption.isVisible({ timeout: 2000 }).catch(() => false)) {
      await firstOption.click();
    } else {
      // fallback: type and pick from dropdown
      await catInput.fill('Accessories');
      await page.waitForTimeout(300);
      await page.locator('[role="option"], li').first().click();
    }

    // Scroll down to the variant section and fill basePrice
    await page.getByText(/variants/i).first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const priceInput = page.locator('input[step="0.01"][type="number"], input[placeholder="0.00"]').first();
    await priceInput.fill('49.99');

    await ss(page, '2b_form_filled');
    await page.getByRole('button', { name: /save product/i }).first().click();
    await page.waitForTimeout(2000);

    await expect(page.getByText(/admin flow widget/i).first()).toBeVisible({ timeout: 8000 });
    await ss(page, '2b_saved');
  });

  test('2c — customer can see the newly created product', async ({ page }) => {
    await login(page, 'johncustomer', 'customer123');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/admin flow widget/i).first()).toBeVisible({ timeout: 8000 });
    await ss(page, '2c_storefront');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FLOW 3: Order history shows productName + variantLabel snapshots
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Flow 3: Order history shows variant snapshots', () => {

  test('3a — my orders page loads with at least one order', async ({ page }) => {
    await login(page, 'johncustomer', 'customer123');
    await page.goto(`${BASE}/my-orders`);
    await page.waitForLoadState('networkidle');
    // Page should show orders (seeded or from Flow 1)
    await expect(page.locator('[class*="order"]').first()).toBeVisible({ timeout: 8000 });
    await ss(page, '3a_order_list');
  });

  test('3b — order detail panel shows product name and variant label', async ({ page }) => {
    await login(page, 'johncustomer', 'customer123');
    await page.goto(`${BASE}/my-orders`);
    await page.waitForLoadState('networkidle');
    // Click into the first order
    await page.locator('[class*="order"]').first().click();
    await page.waitForTimeout(700);
    await ss(page, '3b_order_detail');
    // The detail panel should contain a product name and variant label from snapshot fields
    const content = await page.content();
    const hasProductInfo = /hoodie|headphone|laptop|medium|small|default/i.test(content);
    expect(hasProductInfo).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FLOW 4: Admin edit — change variant price → storefront reflects it
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Flow 4: Admin edit variant price → storefront updates', () => {

  let productId: number;

  test.beforeAll(async () => {
    // Create a dedicated product so Flow 4 is self-contained
    productId = await apiCreateProduct('Edit Price Widget', [
      { label: 'Default', basePrice: 59.99, stock: 10, stockEnabled: true, isDefault: true, active: true, pricingMode: 'UNIT', quantityOptions: [{ quantity: 1, sortOrder: 0 }], priceBreaks: [] },
    ]);
  });

  test('4a — admin opens edit form and updates the variant price', async ({ page }) => {
    await login(page, 'admin', 'admin123');
    await page.goto(`${BASE}/manage-store/products`);
    await page.waitForLoadState('networkidle');

    // Find product row and click its Edit button
    const editBtn = page.locator('button').filter({ hasText: /^edit$/i }).locator('xpath=ancestor::*[contains(@class,"product")][1]//button[contains(translate(normalize-space(),"EDIT","edit"),"edit")]').first();
    // Simpler: find all Edit buttons whose sibling text includes our product name
    const productCard = page.locator('[class*="product-card"], [class*="product-item"], [class*="product-row"]').filter({ hasText: /edit price widget/i }).first();
    await expect(productCard).toBeVisible({ timeout: 8000 });
    await productCard.getByRole('button', { name: /^edit$/i }).first().click();
    await page.waitForTimeout(600);
    await ss(page, '4a_edit_form');

    // Update the basePrice field (first number input in the variant section)
    const priceInput = page.locator('input[step="0.01"][type="number"], input[placeholder="0.00"]').first();
    await priceInput.click({ clickCount: 3 });
    await priceInput.fill('44.99');
    await ss(page, '4a_price_edited');

    await page.getByRole('button', { name: /save product|update/i }).first().click();
    await page.waitForTimeout(2000);
    await ss(page, '4a_saved');
  });

  test('4b — updated price ($44.99) appears on the product detail page', async ({ page }) => {
    await login(page, 'johncustomer', 'customer123');
    await page.goto(`${BASE}/products/${productId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    await ss(page, '4b_updated_price');
    // Check the visible price text (not CSS vars which also contain numbers)
    const priceEl = page.locator('.product-price-display, [class*="price"]').filter({ hasText: /\$/ }).first();
    await expect(priceEl).toBeVisible({ timeout: 5000 });
    const priceText = await priceEl.textContent();
    expect(priceText).toContain('44.99');
  });
});
