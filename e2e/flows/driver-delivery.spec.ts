import { test, expect } from '@playwright/test';
import { ACCOUNTS } from '../helpers/accounts';
import { establishSession, mintBearerToken } from '../helpers/auth';
import { fetchProducts } from '../helpers/products';

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

  test('staff dispatch, driver delivers, with driver RBAC enforced', async ({ browser, request }) => {
    const API = 'http://localhost:3000/api';
    test.slow();

    // Mint admin and manager tokens in parallel — independent logins.
    const [adminToken, managerToken] = await Promise.all([
      mintBearerToken(request, ACCOUNTS.admin),
      mintBearerToken(request, ACCOUNTS.manager),
    ]);

    // --- Admin: make the in-zone ZIP deliverable and drop the delivery minimum ---
    const constraintsRes = await request.put(`${API}/ordering-constraints`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        offlineZipFallbackEnabled: true,
        offlineDeliveryZipCodes: [IN_ZONE_ZIP],
        minimumDeliveryOrderEnabled: false,
        deliveryRadiusMiles: 5,
      },
    });
    expect(constraintsRes.ok(), 'Failed to update ordering constraints').toBeTruthy();

    // --- Manager: grant the customer enough credit to pay for the order ---
    const managerAuth = { Authorization: `Bearer ${managerToken}` };
    const usersRes = await request.get(`${API}/users`, { headers: managerAuth });
    const users = (await usersRes.json()).data;
    const customer = users.find((u: { username: string }) => u.username === ACCOUNTS.customer.username);
    expect(customer, 'Customer not found in seeded users').toBeTruthy();
    const creditRes = await request.post(`${API}/storecredit/${customer.id}/add`, {
      headers: managerAuth,
      data: { amount: CREDIT_AMOUNT, note: 'e2e delivery test credit' },
    });
    expect(creditRes.ok(), 'Credit API call failed').toBeTruthy();

    // Manager UI context for the kanban dispatch below.
    const managerCtx = await browser.newContext();
    await establishSession(managerCtx, ACCOUNTS.manager);
    const managerPage = await managerCtx.newPage();

    // --- Customer: place a DELIVERY × CREDIT order to the in-zone address ---
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

    // Switch to Delivery and fill an in-zone address (unique street marker)
    await customerPage.getByRole('button', { name: 'Delivery', exact: true }).click();
    await customerPage.locator('#street').fill('123 Main Street');
    await customerPage.locator('#city').fill('Houston');
    await customerPage.locator('#zipCode').fill(IN_ZONE_ZIP);

    // Pay with store credit; eligibility check must clear before Place Order enables
    await customerPage.locator('input[name="paymentMethod"][value="STORE_CREDIT"]').check();
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
    const rawId = String((await createRes.json()).data.order.id);
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
    const driverCtx = await browser.newContext();
    await establishSession(driverCtx, ACCOUNTS.driver);
    const driverPage = await driverCtx.newPage();
    await driverPage.goto('/');
    await driverPage.waitForLoadState('networkidle');

    // A delivery driver may ONLY mark DELIVERED — never dispatch an order itself.
    const driverToken = await mintBearerToken(request, ACCOUNTS.driver);
    const dispatchRes = await request.patch(`${API}/orders/${rawId}/status`, {
      headers: { Authorization: `Bearer ${driverToken}` },
      data: { status: 'READY_FOR_DELIVERY' },
    });
    expect(dispatchRes.status(), 'Driver should be forbidden from changing non-DELIVERED status').toBe(403);

    // The dispatched order shows in the driver's "Out for Delivery" panel; the driver
    // completes the handoff via the "mark delivered" control (OUT_FOR_DELIVERY → DELIVERED).
    await driverPage.goto('/delivery-dashboard', { waitUntil: 'domcontentloaded' });
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
