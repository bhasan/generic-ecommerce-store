import { test, expect } from '@playwright/test';
import { ACCOUNTS } from '../helpers/accounts';

// Manager grants store credit to sarahjohnson via authenticated API call (using page.evaluate
// so localStorage token is available), then customer checks out using store credit.
test.describe('Store credit flow', () => {
  const TARGET_USERNAME = 'sarahjohnson';
  const CREDIT_AMOUNT = 500; // generous enough to cover any seeded product

  test('customer can pay with granted store credit', async ({ browser }) => {
    // --- Manager: navigate to app, then grant credit via authenticated fetch ---
    const managerCtx = await browser.newContext({
      storageState: ACCOUNTS.manager.storageStatePath,
    });
    const managerPage = await managerCtx.newPage();
    // Navigate first so storageState (with authToken) is loaded into the browser context
    await managerPage.goto('/');
    await managerPage.waitForLoadState('networkidle');

    const sarah = await managerPage.evaluate(async (username) => {
      const token = localStorage.getItem('authToken');
      const res = await fetch('/api/users', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const users = await res.json();
      return users.find((u: { username: string }) => u.username === username);
    }, TARGET_USERNAME);
    expect(sarah, `${TARGET_USERNAME} not found in seeded users`).toBeTruthy();

    const creditOk = await managerPage.evaluate(async ({ userId, amount }: { userId: number; amount: number }) => {
      const token = localStorage.getItem('authToken');
      const res = await fetch(`/api/credits/${userId}/add`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ amount, note: 'e2e test credit' }),
      });
      return res.ok;
    }, { userId: sarah.id, amount: CREDIT_AMOUNT });
    expect(creditOk, 'Credit API call failed').toBeTruthy();
    await managerCtx.close();

    // --- Customer (sarahjohnson): log in and checkout with CREDIT payment ---
    const customerCtx = await browser.newContext();
    const customerPage = await customerCtx.newPage();

    await customerPage.goto('/login');
    await customerPage.locator('#username').fill(TARGET_USERNAME);
    await customerPage.locator('#password').fill('customer123');
    await customerPage.getByRole('button', { name: 'Sign In' }).click();
    await customerPage.waitForURL(url => !url.pathname.endsWith('/login'), { timeout: 15_000 });

    // Get Wireless Headphones product via unauthenticated API
    const productsRes = await customerPage.request.get('http://localhost:3000/api/products');
    const products = await productsRes.json();
    const headphones = products.find((p: any) => p.name === 'Wireless Headphones');
    expect(headphones).toBeTruthy();

    await customerPage.goto(`/products/${headphones.id}`);
    await expect(customerPage.getByRole('button', { name: 'Add to Cart' })).toBeVisible({ timeout: 10_000 });
    await customerPage.getByRole('button', { name: 'Add to Cart' }).click();
    await customerPage.goto('/cart');
    await customerPage.getByRole('button', { name: 'Proceed to Checkout' }).click();
    await customerPage.waitForURL('**/checkout');

    // Select Store Credit payment
    const creditOption = customerPage.locator('input[name="paymentMethod"][value="CREDIT"]');
    await expect(creditOption).toBeVisible({ timeout: 8_000 });
    await creditOption.check();
    // Credit balance badge should appear showing a positive amount
    await expect(customerPage.getByText(/\$\d+\.\d{2}/).first()).toBeVisible({ timeout: 5_000 });

    await customerPage.getByRole('button', { name: 'Place Order' }).click();
    await customerPage.waitForURL('**/order-success', { timeout: 15_000 });
    await expect(customerPage.getByText('Order Placed Successfully!')).toBeVisible();
    await customerCtx.close();
  });
});
