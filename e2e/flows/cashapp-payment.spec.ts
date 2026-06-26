import { test, expect } from '@playwright/test';
import { ACCOUNTS } from '../helpers/accounts';
import { establishSession, mintBearerToken } from '../helpers/auth';

// End-to-end verification of the CashApp (EXTERNAL) payment flow.
//
// The nuance: an order is created in the DB *before* the customer confirms
// payment. Two outcomes branch from here:
//   A) Customer checks the confirmation box and clicks "Complete Order" →
//      navigates to /order-success; no second order is created.
//   B) Customer clicks "Cancel" → the pending order must be deleted
//      server-side before the cart is restored, or the next checkout
//      produces a duplicate PENDING order for the same customer.
//
// This spec verifies:
//   1. The SendPaymentModal shows the raw order ID (e.g. "#55") and the
//      store's CashApp handle.
//   2. The /order-success badge and memo text reference the same order ID.
//   3. The cancel path fires DELETE /api/orders/:id and the order is
//      confirmed gone before the customer can place a replacement.
//   4. A fresh order after cancel gets a NEW id — no PENDING duplicates.

const API = 'http://localhost:3000/api';

test.describe('CashApp payment flow', () => {
  let productId: number;
  const cashappHandle = '$test-store-handle';
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    adminToken = await mintBearerToken(request, ACCOUNTS.admin);

    // Enable CashApp with a recognisable test handle.
    const psRes = await request.put(`${API}/payment-settings`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        cashapp: { enabled: true, handle: cashappHandle },
        zelle: { enabled: false, handle: '' },
        venmo: { enabled: false, handle: '' },
        cc_payment: { enabled: false, loginId: '', transactionKey: '', sandboxMode: true },
      },
    });
    expect(psRes.ok(), `Failed to configure payment settings: ${psRes.status()}`).toBeTruthy();

    // Grab the first in-stock product.
    const productsRes = await request.get(`${API}/products`);
    const products = await productsRes.json() as any[];
    const available = products.find(
      (p) => p.variants?.some((v: any) => v.stock > 0 || !v.stockEnabled),
    );
    expect(available, 'No in-stock products found').toBeTruthy();
    productId = available.id;
  });

  test.afterAll(async ({ request }) => {
    // Reset handle to empty (mirrors the seeded state).
    await request.put(`${API}/payment-settings`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        cashapp: { enabled: true, handle: '' },
        zelle: { enabled: false, handle: '' },
        venmo: { enabled: false, handle: '' },
        cc_payment: { enabled: false, loginId: '', transactionKey: '', sandboxMode: true },
      },
    });
  });

  // ── A: Happy path ────────────────────────────────────────────────────────────
  test('happy path — order created, modal shows raw ID, success page is consistent', async ({ browser }) => {
    const ctx = await browser.newContext();
    await establishSession(ctx, ACCOUNTS.customer);
    const page = await ctx.newPage();

    await page.goto(`/products/${productId}`);
    await expect(page.getByRole('button', { name: 'Add to Cart' })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Add to Cart' }).click();
    await page.goto('/cart');
    await page.getByRole('button', { name: 'Proceed to Checkout' }).click();
    await page.waitForURL('**/checkout');

    // EXTERNAL (CashApp) is the default payment method — just place the order.
    // Capture the order id from the API response to avoid display-format ambiguity
    // (the success page badge pads with zeros; we want the canonical numeric value).
    const placeBtn = page.getByRole('button', { name: 'Place Order' });
    await expect(placeBtn).toBeEnabled({ timeout: 10_000 });

    const [createRes] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().endsWith('/api/orders') && r.request().method() === 'POST' && r.status() === 201,
      ),
      placeBtn.click(),
    ]);
    const rawOrderId: number = (await createRes.json()).order.id;
    expect(rawOrderId, 'Order id must be a positive integer').toBeGreaterThan(0);

    // ── SendPaymentModal: verify raw order id and store handle ────────────────
    const overlay = page.locator('.send-payment-modal-overlay');
    await expect(overlay).toBeVisible({ timeout: 8_000 });

    // Order id badge in the modal must match what the backend returned.
    await expect(overlay.locator('.send-payment-order-id-value')).toHaveText(`#${rawOrderId}`);

    // Store CashApp handle must appear so the customer knows where to send.
    await expect(overlay.getByText(cashappHandle)).toBeVisible();

    // Check the confirmation checkbox and click "Complete Order".
    await overlay.locator('.send-payment-checkbox').check();
    await overlay.getByRole('button', { name: 'Complete Order' }).click();

    await page.waitForURL('**/order-success', { timeout: 12_000 });

    // ── OrderSuccessPage: verify display consistency ───────────────────────────
    // The big badge is padded (e.g. #000055) — cosmetic only.
    const badge = page.locator('.order-id-number');
    await expect(badge).toBeVisible({ timeout: 8_000 });
    const badgeText = (await badge.textContent())!.trim();
    // Strip leading zeros and compare numeric value.
    const displayedId = parseInt(badgeText.replace(/^#0*/, '') || '0', 10);
    expect(displayedId, 'Badge ID must equal the API order id').toBe(rawOrderId);

    // The memo instruction should reference the raw id (what goes in CashApp memo).
    await expect(
      page.getByText(new RegExp(`#${rawOrderId}(?!\\d)`, 'i')).first(),
    ).toBeVisible();

    // ── Order appears in customer's My Orders ─────────────────────────────────
    await page.goto('/my-orders');
    await expect(page.getByText(`#${rawOrderId}`, { exact: false })).toBeVisible({ timeout: 8_000 });

    await ctx.close();
  });

  // ── B: Cancel path ───────────────────────────────────────────────────────────
  test('cancel path — pending order is deleted before re-order; no PENDING duplicates', async ({
    browser,
    request,
  }) => {
    const ctx = await browser.newContext();
    await establishSession(ctx, ACCOUNTS.customer);
    const page = await ctx.newPage();

    await page.goto(`/products/${productId}`);
    await expect(page.getByRole('button', { name: 'Add to Cart' })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Add to Cart' }).click();
    await page.goto('/cart');
    await page.getByRole('button', { name: 'Proceed to Checkout' }).click();
    await page.waitForURL('**/checkout');

    const placeBtn = page.getByRole('button', { name: 'Place Order' });
    await expect(placeBtn).toBeEnabled({ timeout: 10_000 });

    const [createRes] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().endsWith('/api/orders') && r.request().method() === 'POST' && r.status() === 201,
      ),
      placeBtn.click(),
    ]);
    const firstOrderId: number = (await createRes.json()).order.id;

    // Modal is open — click Cancel and intercept the DELETE request.
    const overlay = page.locator('.send-payment-modal-overlay');
    await expect(overlay).toBeVisible({ timeout: 8_000 });

    const [deleteRes] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes(`/api/orders/${firstOrderId}`) &&
          r.request().method() === 'DELETE',
      ),
      overlay.getByRole('button', { name: 'Cancel' }).click(),
    ]);
    expect(deleteRes.status(), 'DELETE /api/orders/:id should return 2xx').toBeLessThan(300);

    // Confirm the order is gone from the database.
    const orderCheck = await request.get(`${API}/orders/${firstOrderId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(orderCheck.status(), 'Cancelled order should be 404 after delete').toBe(404);

    // Checkout page re-enables (CANCELLED state hides the modal; Place Order button
    // is active again). Cart was restored by the cancel handler.
    await expect(page.getByRole('button', { name: 'Place Order' })).toBeEnabled({ timeout: 8_000 });

    // Place a second order and confirm it has a different id.
    const [create2Res] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().endsWith('/api/orders') && r.request().method() === 'POST' && r.status() === 201,
      ),
      page.getByRole('button', { name: 'Place Order' }).click(),
    ]);
    const secondOrderId: number = (await create2Res.json()).order.id;
    expect(secondOrderId, 'Re-order must produce a distinct order id').not.toBe(firstOrderId);

    // Manager view: the cancelled order must be gone and the re-order must be present.
    // (Other PENDING orders for this customer can exist from seed data or the happy-path
    // test above — we don't assert a total count, only that there's no duplicate.)
    const allOrdersRes = await request.get(`${API}/orders`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const allOrders = (await allOrdersRes.json()) as any[];
    const customerPending = allOrders.filter(
      (o) => o.user?.username === ACCOUNTS.customer.username && o.status === 'PENDING',
    );
    const pendingIds = customerPending.map((o: any) => o.id);

    // The cancelled order must be gone.
    expect(pendingIds, `Cancelled order ${firstOrderId} was not deleted`).not.toContain(firstOrderId);
    // The re-order must exist.
    expect(pendingIds, `Re-order ${secondOrderId} should be PENDING`).toContain(secondOrderId);
    // The re-order id must appear exactly once — no duplication.
    const occurrences = pendingIds.filter((id: number) => id === secondOrderId).length;
    expect(occurrences, `Order ${secondOrderId} appears ${occurrences} times (duplicate?)`).toBe(1);

    // Clean up — cancel this second order too.
    const overlay2 = page.locator('.send-payment-modal-overlay');
    await expect(overlay2).toBeVisible({ timeout: 8_000 });
    await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes(`/api/orders/${secondOrderId}`) &&
          r.request().method() === 'DELETE',
      ),
      overlay2.getByRole('button', { name: 'Cancel' }).click(),
    ]);

    await ctx.close();
  });
});
