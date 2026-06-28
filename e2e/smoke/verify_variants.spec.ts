import { test, expect, Page, request } from '@playwright/test';

const BASE = 'http://localhost:5843';
const API = 'http://localhost:3000';

// Shared state — populated in beforeAll
let productId: number;
let productUrl: string;

async function loginAs(page: Page, username: string, password: string) {
  await page.goto(`${BASE}/login`);
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await page.waitForURL(/localhost:5843\/(products|orders|dashboard|manage)/, { timeout: 10000 });
}

test.beforeAll(async () => {
  // Get admin token via API
  const ctx = await request.newContext();
  const loginResp = await ctx.post(`${API}/api/auth/login`, {
    data: { username: 'admin', password: 'admin123' },
  });
  const { token } = await loginResp.json();

  // Get first category id
  const catsResp = await ctx.get(`${API}/api/categories`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await catsResp.json();
  const cats = Array.isArray(body) ? body : body.data;
  const catId = cats[0].id;

  // Create multi-variant test product
  const createResp = await ctx.post(`${API}/api/products`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      name: 'Test T-Shirt',
      categoryId: catId,
      variants: [
        { label: 'Small', basePrice: 19.99, stock: 10, stockEnabled: true, isDefault: true, active: true, pricingMode: 'UNIT', quantityOptions: [{ quantity: 1, sortOrder: 0 }], priceBreaks: [] },
        { label: 'Medium', basePrice: 21.99, stock: 5, stockEnabled: true, isDefault: false, active: true, pricingMode: 'UNIT', quantityOptions: [{ quantity: 1, sortOrder: 0 }], priceBreaks: [] },
        { label: 'Large', basePrice: 21.99, stock: 0, stockEnabled: true, isDefault: false, active: true, pricingMode: 'UNIT', quantityOptions: [{ quantity: 1, sortOrder: 0 }], priceBreaks: [] },
      ],
      images: [],
    },
  });
  const body = await createResp.json();
  productId = body.product.id;
  productUrl = `${BASE}/products/${productId}`;
  await ctx.dispose();
});

test('products grid shows default-variant price', async ({ page }) => {
  await loginAs(page, 'johncustomer', 'customer123');
  await page.waitForLoadState('networkidle');
  const prices = page.locator('.product-price, .product-list-price');
  await expect(prices.first()).toBeVisible({ timeout: 8000 });
  const priceText = await prices.first().textContent();
  expect(priceText).toMatch(/\$\d+\.\d{2}/);
  await page.screenshot({ path: '/tmp/ss_grid.png' });
});

test('variant selector visible for multi-variant product', async ({ page }) => {
  await loginAs(page, 'johncustomer', 'customer123');
  await page.goto(productUrl);
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('button', { name: /small/i })).toBeVisible({ timeout: 8000 });
  await expect(page.getByRole('button', { name: /medium/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /large/i })).toBeVisible();
  await page.screenshot({ path: '/tmp/ss_variants.png' });
});

test('switching variant updates price display', async ({ page }) => {
  await loginAs(page, 'johncustomer', 'customer123');
  await page.goto(productUrl);
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('button', { name: /small/i })).toBeVisible({ timeout: 8000 });
  const priceLocator = page.locator('.product-price-display, .price-amount, [class*="price"]').first();
  const smallPrice = await priceLocator.textContent();
  console.log('Small price text:', smallPrice);
  await page.getByRole('button', { name: /medium/i }).click();
  await page.waitForTimeout(300);
  const mediumPrice = await priceLocator.textContent();
  console.log('Medium price text:', mediumPrice);
  expect(mediumPrice).toContain('21.99');
  await page.screenshot({ path: '/tmp/ss_medium.png' });
});

test('out-of-stock Large variant disables add-to-cart', async ({ page }) => {
  await loginAs(page, 'johncustomer', 'customer123');
  await page.goto(productUrl);
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('button', { name: /large/i })).toBeVisible({ timeout: 8000 });
  await page.getByRole('button', { name: /large/i }).click();
  await page.waitForTimeout(300);
  const oos = page.getByRole('button', { name: /out of stock/i });
  await expect(oos).toBeVisible({ timeout: 5000 });
  await expect(oos).toBeDisabled();
  await page.screenshot({ path: '/tmp/ss_oos.png' });
});

test('add Medium variant to cart and verify in cart page', async ({ page }) => {
  await loginAs(page, 'johncustomer', 'customer123');
  await page.goto(productUrl);
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('button', { name: /medium/i })).toBeVisible({ timeout: 8000 });
  await page.getByRole('button', { name: /medium/i }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /add to cart/i }).click();
  await page.waitForTimeout(500);
  await page.goto(`${BASE}/cart`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByText(/test t-shirt/i).first()).toBeVisible({ timeout: 5000 });
  await expect(page.getByText(/medium/i).first()).toBeVisible();
  await expect(page.getByText(/21\.99/).first()).toBeVisible();
  await page.screenshot({ path: '/tmp/ss_cart.png' });
});

test('admin manage panel loads and shows products', async ({ page }) => {
  await loginAs(page, 'admin', 'admin123');
  await page.goto(`${BASE}/manage-store/products`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: 'Products' }).first()).toBeVisible({ timeout: 8000 });
  await expect(page.getByText(/test t-shirt/i)).toBeVisible({ timeout: 5000 });
  await page.screenshot({ path: '/tmp/ss_manage.png' });
});
