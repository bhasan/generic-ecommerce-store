import { test, expect } from '@playwright/test';
import { ACCOUNTS } from '../helpers/accounts';

// Full DELIVERY journey across three roles:
//   admin configures the delivery zone (ZIP allowlist) →
//   manager grants the customer store credit →
//   customer places a DELIVERY × CREDIT order to an in-zone address →
//   manager advances PENDING → APPROVED → READY_FOR_DELIVERY →
//   driver builds a route (OUT_FOR_DELIVERY) and marks the order DELIVERED.
//
// In dev/CI there is no Google Geocoding, so eligibility resolves via the offline
// ZIP fallback: an address is deliverable iff its ZIP is in offlineDeliveryZipCodes.
test.describe('Delivery dashboard flow — DELIVERY × CREDIT through to DELIVERED', () => {
  const IN_ZONE_ZIP = '77083';
  const CREDIT_AMOUNT = 500;

  test('staff dispatch, driver delivers, with driver RBAC enforced', async ({ browser }) => {
    // --- Admin: make the in-zone ZIP deliverable and drop the delivery minimum ---
    const adminCtx = await browser.newContext({ storageState: ACCOUNTS.admin.storageStatePath });
    const adminPage = await adminCtx.newPage();
    await adminPage.goto('/');
    await adminPage.waitForLoadState('networkidle');
    const constraintsOk = await adminPage.evaluate(async ({ zip }) => {
      const token = localStorage.getItem('authToken');
      const res = await fetch('/api/ordering-constraints', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offlineZipFallbackEnabled: true,
          offlineDeliveryZipCodes: [zip],
          minimumDeliveryOrderEnabled: false,
          deliveryRadiusMiles: 5,
        }),
      });
      return res.ok;
    }, { zip: IN_ZONE_ZIP });
    expect(constraintsOk, 'Failed to update ordering constraints').toBeTruthy();
    await adminCtx.close();

    // --- Manager: grant the customer enough credit to pay for the order ---
    const managerCtx = await browser.newContext({ storageState: ACCOUNTS.manager.storageStatePath });
    const managerPage = await managerCtx.newPage();
    await managerPage.goto('/');
    await managerPage.waitForLoadState('networkidle');
    const customer = await managerPage.evaluate(async (username) => {
      const token = localStorage.getItem('authToken');
      const res = await fetch('/api/users', { headers: { Authorization: `Bearer ${token}` } });
      const users = await res.json();
      return users.find((u: { username: string }) => u.username === username);
    }, ACCOUNTS.customer.username);
    expect(customer, 'Customer not found in seeded users').toBeTruthy();
    const creditOk = await managerPage.evaluate(async ({ userId, amount }: { userId: number; amount: number }) => {
      const token = localStorage.getItem('authToken');
      const res = await fetch(`/api/credits/${userId}/add`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, note: 'e2e delivery test credit' }),
      });
      return res.ok;
    }, { userId: customer.id, amount: CREDIT_AMOUNT });
    expect(creditOk, 'Credit API call failed').toBeTruthy();

    // --- Customer: place a DELIVERY × CREDIT order to the in-zone address ---
    const customerCtx = await browser.newContext({ storageState: ACCOUNTS.customer.storageStatePath });
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

    // Switch to Delivery and fill an in-zone address (unique street marker)
    await customerPage.getByRole('button', { name: 'Delivery', exact: true }).click();
    await customerPage.locator('#street').fill('123 Main Street');
    await customerPage.locator('#city').fill('Houston');
    await customerPage.locator('#zipCode').fill(IN_ZONE_ZIP);

    // Pay with store credit; eligibility check must clear before Place Order enables
    await customerPage.locator('input[name="paymentMethod"][value="CREDIT"]').check();
    const placeOrder = customerPage.getByRole('button', { name: 'Place Order' });
    await expect(placeOrder).toBeEnabled({ timeout: 15_000 });

    // Capture the authoritative order id from the create-order response (the success
    // page pads the id, and parsing it has proven brittle against seeded orders).
    const [createRes] = await Promise.all([
      customerPage.waitForResponse(
        (r) => r.url().endsWith('/api/orders') && r.request().method() === 'POST' && r.status() === 201,
      ),
      placeOrder.click(),
    ]);
    const rawId = String((await createRes.json()).order.id);
    await customerPage.waitForURL('**/order-success', { timeout: 15_000 });
    await customerCtx.close();

    // --- Manager: PENDING → APPROVED → READY_FOR_DELIVERY ---
    await managerPage.goto('/orders');
    // Scope to MY card and use its inline quick-action buttons. Every kanban card
    // carries its own action buttons, so a board-wide .first() would advance the
    // wrong order; match the card by its exact id badge instead.
    const card = managerPage.locator('.kanban-card').filter({
      has: managerPage.locator('.kanban-card-id', { hasText: new RegExp(`^#${rawId}$`) }),
    });
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.getByRole('button', { name: /approve \(payment verified\)/i }).click();
    // For a DELIVERY order the next quick action is "Ready for Delivery"
    await expect(card.getByRole('button', { name: /ready for delivery/i })).toBeVisible({ timeout: 8_000 });
    await card.getByRole('button', { name: /ready for delivery/i }).click();
    // Confirm READY_FOR_DELIVERY, then staff dispatch via "In Delivery" → OUT_FOR_DELIVERY
    // (STATUS_LABELS.OUT_FOR_DELIVERY === 'In Delivery'). Dispatch is a staff action;
    // the driver performs the final delivery below.
    await expect(card.getByRole('button', { name: /in delivery/i })).toBeVisible({ timeout: 8_000 });
    await card.getByRole('button', { name: /in delivery/i }).click();
    // Once OUT_FOR_DELIVERY the next staff action becomes "Delivered"
    await expect(card.getByRole('button', { name: /^delivered$/i })).toBeVisible({ timeout: 8_000 });
    await managerCtx.close();

    // --- Driver: RBAC boundary + the real delivery handoff ---
    const driverCtx = await browser.newContext({ storageState: ACCOUNTS.driver.storageStatePath });
    const driverPage = await driverCtx.newPage();
    await driverPage.goto('/');
    await driverPage.waitForLoadState('networkidle');

    // A delivery driver may ONLY mark DELIVERED — never dispatch an order itself.
    const dispatchStatus = await driverPage.evaluate(async (orderId) => {
      const token = localStorage.getItem('authToken');
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'READY_FOR_DELIVERY' }),
      });
      return res.status;
    }, rawId);
    expect(dispatchStatus, 'Driver should be forbidden from changing non-DELIVERED status').toBe(403);

    // The dispatched order shows in the driver's "Out for Delivery" panel; the driver
    // completes the handoff via the "mark delivered" control (OUT_FOR_DELIVERY → DELIVERED).
    await driverPage.goto('/delivery-dashboard');
    const routeCard = driverPage.locator('.delivery-order-item.route-order', { hasText: `Order: #${rawId}` });
    await expect(routeCard).toBeVisible({ timeout: 10_000 });
    await routeCard.locator('.btn-delivered-small').click();

    // After DELIVERED the dashboard reloads and this order drops off the board
    await expect(
      driverPage.locator('.delivery-order-item', { hasText: `Order: #${rawId}` })
    ).toHaveCount(0, { timeout: 10_000 });

    await driverCtx.close();
  });
});
