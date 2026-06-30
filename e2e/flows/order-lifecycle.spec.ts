import { test, expect } from '@playwright/test';
import { ACCOUNTS } from '../helpers/accounts';
import { establishSession } from '../helpers/auth';
import { fetchProducts } from '../helpers/products';

// Customer places an order; manager advances it through the full status lifecycle.
test.describe('Order lifecycle — PENDING → APPROVED → READY → COMPLETED', () => {
  test('manager can advance order status end-to-end', async ({ browser }) => {
    test.slow();
    // --- Customer: place order ---
    const customerCtx = await browser.newContext();
    await establishSession(customerCtx, ACCOUNTS.customer);
    const customerPage = await customerCtx.newPage();

    const products = await fetchProducts(customerPage.request);
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
    const managerCtx = await browser.newContext();
    await establishSession(managerCtx, ACCOUNTS.manager);
    const managerPage = await managerCtx.newPage();
    await managerPage.goto('/orders');

    // Scope to MY card by its exact id badge — every kanban card carries its own inline
    // quick-action buttons, so a board-wide .first() can act on the wrong order.
    const card = managerPage.locator('.kanban-card').filter({
      has: managerPage.locator('.kanban-card-id', { hasText: new RegExp(`^#${rawId}$`) }),
    });
    await expect(card).toBeVisible({ timeout: 10_000 });

    // PENDING → APPROVED: button label is "Approve (Payment Verified)"
    await card.getByRole('button', { name: /approve \(payment verified\)/i }).click();
    // After APPROVED the next quick-action button switches to "Ready for Pickup"
    await expect(card.getByRole('button', { name: /ready for pickup/i })).toBeVisible({ timeout: 8_000 });

    // APPROVED → READY_FOR_PICKUP
    await card.getByRole('button', { name: /ready for pickup/i }).click();
    // After READY_FOR_PICKUP the next quick-action button switches to "Picked Up"
    await expect(card.getByRole('button', { name: /picked up/i })).toBeVisible({ timeout: 8_000 });

    // READY → COMPLETED (PICKED_UP): this transition pops a "Take Payment in Store"
    // confirmation that must be accepted ("Paid") before the status actually changes.
    await card.getByRole('button', { name: /picked up/i }).click();
    await managerPage.getByRole('button', { name: 'Paid' }).click({ force: true });
    // PICKED_UP is terminal — the card no longer offers any quick-action button.
    await expect(card.getByRole('button', { name: /picked up/i })).toHaveCount(0, { timeout: 8_000 });

    await managerCtx.close();
  });
});
