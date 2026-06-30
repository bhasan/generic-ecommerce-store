import { test, expect } from '@playwright/test';
import { ACCOUNTS } from '../helpers/accounts';
import { mintBearerToken } from '../helpers/auth';
import { fetchProducts } from '../helpers/products';

// Manager grants store credit to sarahjohnson via direct authenticated API calls
// (access token minted by an in-test API login, since the token is no longer in
// localStorage), then customer checks out using store credit.
test.describe('Store credit flow', () => {
  const TARGET_USERNAME = 'sarahjohnson';
  const CREDIT_AMOUNT = 500; // generous enough to cover any seeded product

  test('customer can pay with granted store credit', async ({ browser, request }) => {
    // --- Manager: mint a bearer token via direct API login, then grant credit ---
    const token = await mintBearerToken(request, ACCOUNTS.manager);
    const auth = { Authorization: `Bearer ${token}` };

    const usersRes = await request.get('http://localhost:3000/api/users', { headers: auth });
    const users = (await usersRes.json()).data;
    const sarah = users.find((u: { username: string }) => u.username === TARGET_USERNAME);
    expect(sarah, `${TARGET_USERNAME} not found in seeded users`).toBeTruthy();

    const creditRes = await request.post(`http://localhost:3000/api/storecredit/${sarah.id}/add`, {
      headers: auth,
      data: { amount: CREDIT_AMOUNT, note: 'e2e test credit' },
    });
    expect(creditRes.ok(), 'Credit API call failed').toBeTruthy();

    // --- Customer (sarahjohnson): log in and checkout with CREDIT payment ---
    const customerCtx = await browser.newContext();
    const customerPage = await customerCtx.newPage();

    await customerPage.goto('/login');
    await customerPage.locator('#username').fill(TARGET_USERNAME);
    await customerPage.locator('#password').fill('customer123');
    await customerPage.getByRole('button', { name: 'Sign In' }).click();
    await customerPage.waitForURL(url => !url.pathname.endsWith('/login'), { timeout: 15_000 });

    // Get Wireless Headphones product via authenticated API
    const products = await fetchProducts(customerPage.request);
    const headphones = products.find((p: any) => p.name === 'Wireless Headphones');
    expect(headphones).toBeTruthy();

    await customerPage.goto(`/products/${headphones.id}`);
    await expect(customerPage.getByRole('button', { name: 'Add to Cart' })).toBeVisible({ timeout: 10_000 });
    await customerPage.getByRole('button', { name: 'Add to Cart' }).click();
    await customerPage.goto('/cart');
    await customerPage.getByRole('button', { name: 'Proceed to Checkout' }).click();
    await customerPage.waitForURL('**/checkout');

    // Select Store Credit payment
    const creditOption = customerPage.locator('input[name="paymentMethod"][value="STORE_CREDIT"]');
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
