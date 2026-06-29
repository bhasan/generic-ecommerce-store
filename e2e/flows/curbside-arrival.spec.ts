import { test, expect } from '@playwright/test';
import { ACCOUNTS } from '../helpers/accounts';
import { establishSession } from '../helpers/auth';

// Customer places a CURBSIDE order → manager advances to READY_FOR_PICKUP → customer clicks "I'm Here"
// → staff orders page shows "Customer Arrived".
test.describe('Curbside arrival flow', () => {
  const vehicleMake = `e2e Honda ${Date.now()}`;
  const vehicleColor = 'Blue';

  test('customer arrival notification reaches staff', async ({ browser }) => {
    test.slow();
    // --- Customer: place CURBSIDE order ---
    const customerCtx = await browser.newContext();
    await establishSession(customerCtx, ACCOUNTS.customer);
    const customerPage = await customerCtx.newPage();

    const productsRes = await customerPage.request.get('http://localhost:3000/api/products');
    const body = await productsRes.json();
    const products = Array.isArray(body) ? body : body.data;
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
    const managerCtx = await browser.newContext();
    await establishSession(managerCtx, ACCOUNTS.manager);
    const managerPage = await managerCtx.newPage();
    await managerPage.goto('/orders');
    // Scope to MY card by its exact id badge — kanban cards carry their own inline
    // quick-action buttons, so a board-wide .first() can act on the wrong order.
    const card = managerPage.locator('.kanban-card').filter({
      has: managerPage.locator('.kanban-card-id', { hasText: new RegExp(`^#${rawId}$`) }),
    });
    await expect(card).toBeVisible({ timeout: 10_000 });
    // PENDING → APPROVED
    await card.getByRole('button', { name: /approve \(payment verified\)/i }).click();
    // After APPROVED the next quick-action button switches to "Ready for Pickup"
    await expect(card.getByRole('button', { name: /ready for pickup/i })).toBeVisible({ timeout: 8_000 });
    // APPROVED → READY_FOR_PICKUP
    await card.getByRole('button', { name: /ready for pickup/i }).click();
    // Confirms the transition: the next staff action becomes "Picked Up"
    await expect(card.getByRole('button', { name: /picked up/i })).toBeVisible({ timeout: 8_000 });

    // --- Customer: click "I'm Here" on my-orders ---
    await customerPage.goto('/my-orders');
    await expect(customerPage.getByText(`Order #${rawId}`, { exact: false })).toBeVisible({ timeout: 10_000 });
    await customerPage.getByRole('button', { name: "I'm Here" }).first().click();
    // After clicking I'm Here, the order status should update to ARRIVED
    await expect(customerPage.getByText(/arrived/i).first()).toBeVisible({ timeout: 8_000 });

    // --- Manager: verify staff view flags this order as arrived ---
    // The kanban card gains the `kanban-card-arrived` class when status === ARRIVED
    // ("Customer Arrived" itself is the column header, not card text).
    await managerPage.reload({ waitUntil: 'domcontentloaded' });
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card).toHaveClass(/kanban-card-arrived/, { timeout: 10_000 });

    await customerCtx.close();
    await managerCtx.close();
  });
});
