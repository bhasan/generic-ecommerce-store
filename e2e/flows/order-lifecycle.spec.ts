import { test, expect } from '@playwright/test';
import { ACCOUNTS } from '../helpers/accounts';

// Customer places an order; manager advances it through the full status lifecycle.
test.describe('Order lifecycle — PENDING → APPROVED → READY → COMPLETED', () => {
  test('manager can advance order status end-to-end', async ({ browser }) => {
    // --- Customer: place order ---
    const customerCtx = await browser.newContext({
      storageState: ACCOUNTS.customer.storageStatePath,
    });
    const customerPage = await customerCtx.newPage();

    const productsRes = await customerPage.request.get('http://localhost:3000/api/products');
    const products = await productsRes.json();
    const laptopBag = products.find((p: any) => p.name === 'Laptop Bag');
    expect(laptopBag).toBeTruthy();

    await customerPage.goto(`/products/${laptopBag.id}`);
    await expect(customerPage.getByRole('button', { name: 'Add to Cart' })).toBeVisible({ timeout: 10_000 });
    await customerPage.getByRole('button', { name: 'Add to Cart' }).click();
    await customerPage.goto('/cart');
    await customerPage.getByRole('button', { name: 'Proceed to Checkout' }).click();
    await customerPage.waitForURL('**/checkout');

    await customerPage.locator('input[name="paymentMethod"][value="IN_STORE"]').check();
    // Fill special instructions with marker if the field is present
    const instructionsBox = customerPage.locator('textarea').first();
    if (await instructionsBox.isVisible()) {
      await instructionsBox.fill(`e2e-lifecycle-${Date.now()}`);
    }
    await customerPage.getByRole('button', { name: 'Place Order' }).click();
    await customerPage.waitForURL('**/order-success', { timeout: 15_000 });

    // Extract raw numeric id — success page pads to "#000055", orders page shows "#55"
    const orderIdText = await customerPage.locator('.order-id-number').textContent();
    const rawId = String(parseInt(orderIdText!.replace('#', '').trim(), 10));
    await customerCtx.close();

    // --- Manager: advance order through lifecycle ---
    const managerCtx = await browser.newContext({
      storageState: ACCOUNTS.manager.storageStatePath,
    });
    const managerPage = await managerCtx.newPage();
    await managerPage.goto('/orders');

    // Staff kanban shows order id as "#55" (no padding); clicking the card opens the detail panel
    await expect(managerPage.locator('.kanban-card-id', { hasText: `#${rawId}` })).toBeVisible({ timeout: 10_000 });
    await managerPage.locator('.kanban-card-id', { hasText: `#${rawId}` }).click();

    // PENDING → APPROVED: button label is "Approve (Payment Verified)"
    await managerPage.getByRole('button', { name: /approve \(payment verified\)/i }).first().click();
    // After APPROVED the next quick-action button switches to "Ready for Pickup"
    await expect(managerPage.getByRole('button', { name: /ready for pickup/i }).first()).toBeVisible({ timeout: 8_000 });

    // APPROVED → READY_FOR_PICKUP
    await managerPage.getByRole('button', { name: /ready for pickup/i }).first().click();
    // After READY_FOR_PICKUP the next quick-action button switches to "Picked Up"
    await expect(managerPage.getByRole('button', { name: /picked up/i }).first()).toBeVisible({ timeout: 8_000 });

    // READY → COMPLETED (PICKED_UP in the system)
    await managerPage.getByRole('button', { name: /picked up/i }).first().click();
    await expect(managerPage.getByText('Picked Up').first()).toBeVisible({ timeout: 8_000 });

    await managerCtx.close();
  });
});
