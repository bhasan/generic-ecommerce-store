/**
 * Checkout e2e regression suite — covers every fulfillment × payment combination
 * that the checkout rewrite (Steps 1–8) touched.
 *
 * All backend API calls are intercepted via a single page.route('**\/*') handler so no
 * running backend is required. The test seeds localStorage with a fake auth token + user
 * + cart before React boots, so ProtectedRoute passes without a real login.
 */
import { test, expect, Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const FAKE_USER = {
  id: 1,
  name: 'Test User',
  email: 'test@example.com',
  username: 'testuser',
  cashapp: '$customer-one',
  roles: ['CUSTOMER'],
  creditBalance: 150,
};

const FAKE_CART = [
  {
    id: 1,
    name: 'Test Product',
    price: 20,
    quantity: 1,
    stock: 10,
    stockEnabled: true,
    categoryId: 1,
    category: { name: 'General', allowedQuantities: [], quantityDiscounts: null },
    allowedQuantitiesOverride: [],
    quantityDiscountsOverride: null,
    images: [],
  },
];

const FAKE_ORDER_PENDING = {
  id: 99,
  userId: 1,
  total: 22,
  status: 'PENDING',
  deliveryMethod: 'PICKUP',
  paymentMethod: 'CREDIT',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  items: [],
};

const FAKE_ORDER_PENDING_PAYMENT = {
  ...FAKE_ORDER_PENDING,
  status: 'PENDING_PAYMENT',
  paymentMethod: 'CC',
};

const FAKE_STORE_CONFIG = {
  minimumDeliveryOrder: 0,
  minimumDeliveryOrderEnabled: false,
  deliveryRadiusMiles: 5,
  offlineZipFallbackEnabled: false,
  offlineDeliveryZipCodes: [],
  storeName: 'Test Store',
  storePhone: '555-1234',
  storeAddress: '123 Store St',
  paymentSettings: { cc_payment: { enabled: true } },
};

const FAKE_DELIVERY_ELIGIBILITY = {
  deliverable: true,
  deliveryZoneStatus: 'IN_ZONE',
  distanceMiles: 2,
  thresholdMiles: 5,
  message: 'In range',
  canonicalAddress: '123 Main St, Houston, TX 77001',
  checkedAt: new Date().toISOString(),
};

// ---------------------------------------------------------------------------
// Helper: seed localStorage, mock all API traffic, navigate to checkout
//
// Uses a single page.route('**/*') handler to avoid Playwright LIFO conflicts
// when multiple page.route() calls are mixed with mockCreateOrder calls.
//
// Set page._orderFulfillment before calling seedAndNavigate to control what
// POST /api/orders returns.
// After seedAndNavigate, read page._capturedOrderBody to inspect the payload.
// ---------------------------------------------------------------------------

async function seedAndNavigate(page: Page, orderFulfillment?: object) {
  // The access token now lives in memory and is minted from the refresh cookie on
  // mount (see the /api/auth/refresh mock below), so we only seed cached user/cart.
  await page.addInitScript(({ user, cart }: { user: object; cart: object[] }) => {
    localStorage.setItem('userData', JSON.stringify(user));
    // CartContext reads 'cartData_v2' (renamed during the AppContext split).
    localStorage.setItem('cartData_v2', JSON.stringify(cart));
  }, { user: FAKE_USER, cart: FAKE_CART });

  let capturedOrderBody: Record<string, unknown> = {};

  await page.route('**/*', async route => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes('/api/auth/refresh')) return route.fulfill({ json: { token: 'fake-jwt-token' } });
    if (url.includes('/api/auth/profile')) return route.fulfill({ json: FAKE_USER });
    if (url.includes('/api/storecredit') || url.includes('/api/credits/')) return route.fulfill({ json: { balance: FAKE_USER.creditBalance } });
    if (url.includes('/api/config')) return route.fulfill({ json: FAKE_STORE_CONFIG });
    if (url.includes('/api/notifications/unread-count')) return route.fulfill({ json: { count: 0 } });
    if (url.includes('/api/notifications/staff')) return route.fulfill({ json: { count: 0 } });
    if (url.includes('/api/notifications')) return route.fulfill({ json: [] });
    if (url.includes('/api/categories')) return route.fulfill({ json: [] });
    if (url.includes('/api/branding')) return route.fulfill({ status: 204, body: '' });
    if (url.includes('/api/products')) return route.fulfill({ json: FAKE_CART });

    if (url.includes('/api/orders')) {
      // payment-token endpoint
      if (method === 'POST' && /\/orders\/\d+\/payment-token/.test(url)) {
        return route.fulfill({ json: { token: 'tok_test', paymentFormUrl: 'https://test.authorize.net/payment/payment' } });
      }
      // delivery eligibility
      if (method === 'POST' && url.includes('/delivery-eligibility')) {
        return route.fulfill({ json: FAKE_DELIVERY_ELIGIBILITY });
      }
      // order creation
      if (method === 'POST') {
        capturedOrderBody = JSON.parse(route.request().postData() ?? '{}');
        const fulfillment = orderFulfillment ?? { order: { ...FAKE_ORDER_PENDING } };
        return route.fulfill({ json: fulfillment });
      }
      return route.fulfill({ json: [] });
    }

    // Any other authed API call must NOT leak to the real backend: with a fake
    // token it would 401, and the refresh-retry would then escalate to logout.
    // Return a benign empty object so the mocked session stays authenticated.
    if (url.includes('/api/')) return route.fulfill({ json: {} });

    return route.continue();
  });

  // Expose captured body through the page so tests can assert on it
  (page as any)._getCapturedOrderBody = () => capturedOrderBody;

  await page.goto('/checkout');
  await expect(page.locator('.btn-place-order')).toBeVisible({ timeout: 15_000 });
}

async function selectPaymentMethod(page: Page, label: RegExp) {
  await page.getByRole('radio', { name: label }).check();
}

// ---------------------------------------------------------------------------
// Fulfillment × payment matrix
// ---------------------------------------------------------------------------

test.describe('Checkout — fulfillment × payment matrix', () => {
  test('PICKUP × CREDIT — places order and navigates to success', async ({ page }) => {
    await seedAndNavigate(page, { order: FAKE_ORDER_PENDING });

    await selectPaymentMethod(page, /store credit/i);
    await page.locator('.btn-place-order').click();

    await expect(page).toHaveURL(/\/order-success/, { timeout: 10_000 });
  });

  test('PICKUP × IN_STORE — places order and navigates to success', async ({ page }) => {
    await seedAndNavigate(page, { order: { ...FAKE_ORDER_PENDING, paymentMethod: 'IN_STORE' } });

    await selectPaymentMethod(page, /pay in.?store/i);
    await page.locator('.btn-place-order').click();

    await expect(page).toHaveURL(/\/order-success/, { timeout: 10_000 });
  });

  test('PICKUP × EXTERNAL — shows send-payment modal after order creation', async ({ page }) => {
    await seedAndNavigate(page, { order: { ...FAKE_ORDER_PENDING, paymentMethod: 'EXTERNAL' } });

    await selectPaymentMethod(page, /cashapp/i);
    await page.locator('.btn-place-order').click();

    await expect(page.getByText(/order placed successfully/i)).toBeVisible({ timeout: 10_000 });
  });

  test('PICKUP × CC — opens CC payment modal after order creation', async ({ page }) => {
    await seedAndNavigate(page, { order: FAKE_ORDER_PENDING_PAYMENT });

    await selectPaymentMethod(page, /credit.*debit.*card/i);
    await expect(page.locator('.btn-place-order')).toHaveText(/place order & pay/i);
    await page.locator('.btn-place-order').click();

    // CC payment opens the AuthorizeNet modal overlay
    await expect(page.locator('.modal-overlay')).toBeVisible({ timeout: 10_000 });
  });

  test('CURBSIDE × EXTERNAL — sends vehicleDescription string, shows send-payment modal', async ({ page }) => {
    await seedAndNavigate(page, { order: { ...FAKE_ORDER_PENDING, deliveryMethod: 'CURBSIDE', paymentMethod: 'EXTERNAL' } });

    await page.getByRole('button', { name: /curbside/i }).click();
    await page.getByLabel(/vehicle make.*model/i).fill('Toyota Camry');
    await page.getByLabel(/vehicle color/i).fill('Silver');
    await selectPaymentMethod(page, /cashapp/i);
    await page.locator('.btn-place-order').click();

    await expect(page.getByText(/order placed successfully/i)).toBeVisible({ timeout: 10_000 });

    const body = (page as any)._getCapturedOrderBody();
    expect(body.vehicleDescription).toBe('Silver Toyota Camry');
    expect(body.deliveryAddress).toBeUndefined();
  });

  test('CURBSIDE × CREDIT — places order with vehicleDescription string', async ({ page }) => {
    await seedAndNavigate(page, { order: { ...FAKE_ORDER_PENDING, deliveryMethod: 'CURBSIDE', paymentMethod: 'CREDIT' } });

    await page.getByRole('button', { name: /curbside/i }).click();
    await page.getByLabel(/vehicle make.*model/i).fill('Honda Civic');
    await page.getByLabel(/vehicle color/i).fill('Blue');
    await selectPaymentMethod(page, /store credit/i);
    await page.locator('.btn-place-order').click();

    await expect(page).toHaveURL(/\/order-success/, { timeout: 10_000 });
    expect((page as any)._getCapturedOrderBody().vehicleDescription).toBe('Blue Honda Civic');
  });

  test('CURBSIDE × IN_STORE — places order with vehicleDescription string', async ({ page }) => {
    await seedAndNavigate(page, { order: { ...FAKE_ORDER_PENDING, deliveryMethod: 'CURBSIDE', paymentMethod: 'IN_STORE' } });

    await page.getByRole('button', { name: /curbside/i }).click();
    await page.getByLabel(/vehicle make.*model/i).fill('Ford F-150');
    await page.getByLabel(/vehicle color/i).fill('Red');
    await selectPaymentMethod(page, /pay in.?store/i);
    await page.locator('.btn-place-order').click();

    await expect(page).toHaveURL(/\/order-success/, { timeout: 10_000 });
    expect((page as any)._getCapturedOrderBody().vehicleDescription).toBe('Red Ford F-150');
  });

  test('DELIVERY × CREDIT — places order with structured deliveryAddress', async ({ page }) => {
    await seedAndNavigate(page, { order: { ...FAKE_ORDER_PENDING, deliveryMethod: 'DELIVERY', paymentMethod: 'CREDIT' } });

    await page.getByRole('button', { name: /^delivery$/i }).click();
    await page.getByLabel(/street/i).fill('123 Main St');
    await page.getByLabel(/city/i).fill('Houston');
    await page.getByLabel(/zip/i).fill('77001');

    await expect(page.getByText(/in range|eligible|delivering/i)).toBeVisible({ timeout: 5_000 });

    await selectPaymentMethod(page, /store credit/i);
    await page.locator('.btn-place-order').click();

    await expect(page).toHaveURL(/\/order-success/, { timeout: 10_000 });
    const body = (page as any)._getCapturedOrderBody();
    expect(body.deliveryMethod).toBe('DELIVERY');
    expect(body.deliveryAddress).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Validation guards — form errors prevent submission
// ---------------------------------------------------------------------------

test.describe('Checkout — validation guards', () => {
  test('CURBSIDE — blocks submission when vehicle fields are empty', async ({ page }) => {
    await seedAndNavigate(page);

    await page.getByRole('button', { name: /curbside/i }).click();
    await page.locator('.btn-place-order').click();

    await expect(page).not.toHaveURL(/\/order-success/);
    await expect(page.getByText(/vehicle/i).first()).toBeVisible();
  });

  test('DELIVERY — button is disabled when address fields are empty', async ({ page }) => {
    await seedAndNavigate(page);

    await page.getByRole('button', { name: /^delivery$/i }).click();

    // deliveryAddressComplete=false with empty fields → button is disabled (not just validation-blocked)
    await expect(page.locator('.btn-place-order')).toBeDisabled({ timeout: 5_000 });
  });
});

// ---------------------------------------------------------------------------
// CC payment retry
// ---------------------------------------------------------------------------

test.describe('Checkout — CC payment retry', () => {
  test('retry overlay appears after CC payment failure message', async ({ page }) => {
    await seedAndNavigate(page, { order: FAKE_ORDER_PENDING_PAYMENT });

    await selectPaymentMethod(page, /credit.*debit.*card/i);
    await page.locator('.btn-place-order').click();

    // Wait for the CC modal to appear (order was created, token returned by mock)
    await page.waitForTimeout(1000);

    // Simulate the Authorize.Net iframe posting a payment-cancelled message.
    // The modal listens for URLSearchParams-formatted strings (communicator.html protocol).
    await page.evaluate(() => {
      window.postMessage('action=cancel', window.location.origin);
    });

    await expect(page.locator('.payment-retry-card')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/payment unsuccessful/i)).toBeVisible();
  });
});
