import { test, expect } from '@playwright/test';
import { ACCOUNTS } from '../helpers/accounts';
import { establishSession } from '../helpers/auth';

test.describe('Customer order flow — browse → cart → checkout → my-orders', () => {
  test.beforeEach(async ({ context }) => { await establishSession(context, ACCOUNTS.customer); });

  test('PICKUP × IN_STORE order appears in my-orders by order id', async ({ page }) => {
    // Resolve a purchasable product ID via API (products endpoint is unauthenticated)
    const productsRes = await page.request.get('http://localhost:3000/api/products');
    const body = await productsRes.json();
    const products = Array.isArray(body) ? body : body.data;
    const headphones = products.find((p: any) => p.name === 'Wireless Headphones');
    expect(headphones, 'Wireless Headphones not found in seed data').toBeTruthy();

    // Navigate directly to the product detail page
    await page.goto(`/products/${headphones.id}`);
    await expect(page.getByRole('button', { name: 'Add to Cart' })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Add to Cart' }).click();

    // Proceed to checkout
    await page.goto('/cart');
    await expect(page.getByText('Wireless Headphones').first()).toBeVisible();
    await page.getByRole('button', { name: 'Proceed to Checkout' }).click();
    await page.waitForURL('**/checkout');

    // Select PICKUP (default) and IN_STORE payment
    await page.locator('input[name="paymentMethod"][value="IN_STORE"]').check();

    // Place order
    await page.getByRole('button', { name: 'Place Order' }).click();
    await page.waitForURL('**/order-success', { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Order Placed Successfully!' })).toBeVisible();

    // Success page shows padded id like "#000055"; other pages show raw "#55"
    const orderIdText = await page.locator('.order-id-number').textContent();
    expect(orderIdText).toBeTruthy();
    const rawId = String(parseInt(orderIdText!.replace('#', '').trim(), 10));

    // Navigate to my-orders and find this specific order — CustomerOrderList shows "Order #55"
    await page.goto('/my-orders');
    await expect(page.getByText(`Order #${rawId}`, { exact: false })).toBeVisible({ timeout: 10_000 });
  });
});
