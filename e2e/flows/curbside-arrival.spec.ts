import { test, expect } from '@playwright/test';
import { ACCOUNTS } from '../helpers/accounts';

// Customer places a CURBSIDE order → manager advances to READY_FOR_PICKUP → customer clicks "I'm Here"
// → staff orders page shows "Customer Arrived".
test.describe('Curbside arrival flow', () => {
  const vehicleMake = `e2e Honda ${Date.now()}`;
  const vehicleColor = 'Blue';

  test('customer arrival notification reaches staff', async ({ browser }) => {
    // --- Customer: place CURBSIDE order ---
    const customerCtx = await browser.newContext({
      storageState: ACCOUNTS.customer.storageStatePath,
    });
    const customerPage = await customerCtx.newPage();

    const productsRes = await customerPage.request.get('http://localhost:3000/api/products');
    const products = await productsRes.json();
    const smartWatch = products.find((p: any) => p.name === 'Smart Watch');
    expect(smartWatch).toBeTruthy();

    await customerPage.goto(`/products/${smartWatch.id}`);
    await expect(customerPage.getByRole('button', { name: 'Add to Cart' })).toBeVisible({ timeout: 10_000 });
    await customerPage.getByRole('button', { name: 'Add to Cart' }).click();
    await customerPage.goto('/cart');
    await customerPage.getByRole('button', { name: 'Proceed to Checkout' }).click();
    await customerPage.waitForURL('**/checkout');

    // Switch to Curbside Pickup
    await customerPage.getByRole('button', { name: 'Curbside Pickup' }).click();
    await customerPage.locator('#vehicleMakeModel').fill(vehicleMake);
    await customerPage.locator('#vehicleColor').fill(vehicleColor);
    await customerPage.locator('input[name="paymentMethod"][value="IN_STORE"]').check();
    await customerPage.getByRole('button', { name: 'Place Order' }).click();
    await customerPage.waitForURL('**/order-success', { timeout: 15_000 });

    const orderIdText = await customerPage.locator('.order-id-number').textContent();
    const rawId = String(parseInt(orderIdText!.replace('#', '').trim(), 10));

    // --- Manager: advance order to READY_FOR_PICKUP ---
    const managerCtx = await browser.newContext({
      storageState: ACCOUNTS.manager.storageStatePath,
    });
    const managerPage = await managerCtx.newPage();
    await managerPage.goto('/orders');
    await expect(managerPage.locator('.kanban-card-id', { hasText: `#${rawId}` })).toBeVisible({ timeout: 10_000 });
    await managerPage.locator('.kanban-card-id', { hasText: `#${rawId}` }).click();
    // PENDING → APPROVED
    await managerPage.getByRole('button', { name: /approve \(payment verified\)/i }).first().click();
    // After APPROVED the next quick-action button switches to "Ready for Pickup"
    await expect(managerPage.getByRole('button', { name: /ready for pickup/i }).first()).toBeVisible({ timeout: 8_000 });
    // APPROVED → READY_FOR_PICKUP
    await managerPage.getByRole('button', { name: /ready for pickup/i }).first().click();
    await expect(managerPage.getByText('Ready for Pickup').first()).toBeVisible({ timeout: 8_000 });

    // --- Customer: click "I'm Here" on my-orders ---
    await customerPage.goto('/my-orders');
    await expect(customerPage.getByText(`Order #${rawId}`, { exact: false })).toBeVisible({ timeout: 10_000 });
    await customerPage.getByRole('button', { name: "I'm Here" }).first().click();
    // After clicking I'm Here, the order status should update to ARRIVED
    await expect(customerPage.getByText(/arrived/i).first()).toBeVisible({ timeout: 8_000 });

    // --- Manager: verify staff view shows Customer Arrived for this order ---
    await managerPage.reload();
    await expect(managerPage.getByText('Customer Arrived').first()).toBeVisible({ timeout: 10_000 });

    await customerCtx.close();
    await managerCtx.close();
  });
});
