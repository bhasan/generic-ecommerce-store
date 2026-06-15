# Testing Guide

This document describes the full testing stack for Smoke Station Delivery — what each layer tests,
how to run it, and the conventions to follow when adding tests.

---

## Quick reference

| Command | What it runs |
|---|---|
| `npm test` | Backend Vitest + Frontend Vitest (CI baseline) |
| `npm run test:backend` | Backend Vitest only |
| `npm run test:web` | Frontend Vitest only |
| `npm run test:e2e` | Playwright e2e (auto-starts Vite, no backend needed) |
| `npm run test:e2e:ui` | Playwright with interactive UI explorer |

All commands run from the **workspace root** (`/smoke-station-delivery/`).

---

## Layer 1 — Backend unit tests (Vitest)

**Location:** `backend/src/**/*.test.ts`  
**Runner:** Vitest (configured in `backend/vitest.config.ts`)  
**Run:** `npm run test:backend`

### What is tested

- Service-layer logic in isolation: `order.service`, `credit.service`, `thermalPrinter.service`, etc.
- Strategy registries: `backend/src/services/payments/registry.test.ts`, `backend/src/services/fulfillment/registry.test.ts`
- Route-level validators (where they have standalone unit coverage)

### Mock conventions

All tests use **`vi.mock()`** to replace Prisma and external services. Because Vitest
processes mock calls at transform time, mocks that are referenced before import statements
must use **`vi.hoisted()`**:

```ts
// REQUIRED pattern for mocks used in vi.mock() factory functions
const prismaMock = vi.hoisted(() => ({
  order: { create: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock('../config/database', () => ({ default: prismaMock }));
```

Omitting `vi.hoisted()` causes `ReferenceError: Cannot access '...' before initialization`.

### Parametric matrix tests

The checkout rewrite introduced **`it.each`** parametric tests to cover every
fulfillment × payment combination in one file:

**`backend/src/services/order.service.matrix.test.ts`**

```
DELIVERY × EXTERNAL    DELIVERY × CREDIT    DELIVERY × CC
PICKUP × EXTERNAL      PICKUP × CREDIT      PICKUP × IN_STORE    PICKUP × CC
CURBSIDE × EXTERNAL    CURBSIDE × CREDIT    CURBSIDE × IN_STORE  CURBSIDE × CC
```

Plus three rejection cases: `IN_STORE` rejected for DELIVERY, missing vehicle description
for CURBSIDE, and out-of-zone address for DELIVERY.

Pattern used:
```ts
const matrix: MatrixCase[] = [
  { label: 'DELIVERY × EXTERNAL', deliveryMethod: 'DELIVERY', paymentMethod: 'EXTERNAL', ... },
  ...
];

it.each(matrix)('$label', async ({ deliveryMethod, paymentMethod, ... }) => {
  // assert prismaMock.order.create was called with the right status and fields
});
```

Each strategy owns: `initialStatus()` (PENDING vs PENDING_PAYMENT), `validate()`,
`applyInTransaction()`, `notifiesOnCreate()`, and `refundOnDelete()`.

---

## Layer 2 — Frontend unit tests (Vitest + jsdom)

**Location:** `web/src/**/*.test.{js,jsx}`  
**Runner:** Vitest with jsdom (configured in `web/vite.config.js → test`)  
**Run:** `npm run test:web`

### What is tested

- React component rendering and interaction via **React Testing Library**
- API service functions (`ordersApi`, `authApi`, etc.)
- Context behaviour (`AppContext`)
- Key flows: checkout submission, payment method selection, order success

### Key test files

| File | What it covers |
|---|---|
| `web/src/features/cart/CheckoutPage.test.jsx` | Full checkout form interaction: field validation, payment selection, order submission across fulfillment methods, CC modal, retry flow, external-payment cancel/restore |
| `web/src/context/AppContext.test.jsx` | `checkout()` function call signatures, auth side-effects |
| `web/src/services/ordersApi.test.js` | `createOrder()` payload shape, delivery vs curbside branching |
| `web/src/features/orders/OrderDetailPanel.test.jsx` | `vehicleDescription` display with fallback to legacy `deliveryAddress` strings |

### Parametric matrix (frontend)

`CheckoutPage.test.jsx` includes an `it.each` matrix covering 6 fulfillment × payment
submission scenarios, asserting the correct `checkout()` call args and post-order outcome
(success navigation vs send-payment modal).

### Mocking conventions

- **`vi.mock('../../context/AppContext', ...)`** — stub `checkout`, `cancelOrder`, etc. to control outcomes
- **`vi.mock('../../services/ordersApi', ...)`** — stub `createOrder` to return controlled order objects
- Tests use `@testing-library/user-event` for realistic interaction (typing, clicking)
- Tests import and use `DeliveryMethod` / `PaymentMethod` from `web/src/constants/orderMethods.js`
  to avoid string literals that drift out of sync

---

## Layer 3 — Playwright e2e tests

**Location:** `e2e/checkout.spec.ts`  
**Runner:** Playwright (configured in `playwright.config.ts` at workspace root)  
**Run:** `npm run test:e2e`

Playwright auto-starts the Vite dev server on port 5843 before running. It reuses an
already-running server when `reuseExistingServer: true` (the default config). **No backend
is required** — all API traffic is mocked at the browser network layer.

### What is tested

11 browser-level tests across three groups:

**Fulfillment × payment matrix (8 tests)**

| Test | What is asserted |
|---|---|
| PICKUP × CREDIT | Navigates to `/order-success` |
| PICKUP × IN_STORE | Navigates to `/order-success` |
| PICKUP × EXTERNAL | SendPaymentModal appears ("Order Placed Successfully!") |
| PICKUP × CC | AuthorizeNet modal overlay (`.modal-overlay`) appears |
| CURBSIDE × EXTERNAL | `vehicleDescription: 'Silver Toyota Camry'` sent as flat string; no `deliveryAddress`; modal appears |
| CURBSIDE × CREDIT | `vehicleDescription: 'Blue Honda Civic'`; navigates to success |
| CURBSIDE × IN_STORE | `vehicleDescription: 'Red Ford F-150'`; navigates to success |
| DELIVERY × CREDIT | `deliveryAddress` object sent; navigates to success |

**Validation guards (2 tests)**

- CURBSIDE with empty vehicle fields: error text appears, no navigation
- DELIVERY with empty address fields: Place Order button is disabled

**CC payment retry (1 test)**

- Simulates an Authorize.Net cancel message (`window.postMessage('action=cancel', origin)`)
- Asserts `.payment-retry-card` overlay appears with "Payment Unsuccessful"

### API mocking architecture

All tests use a **single `page.route('**/*')` handler** with URL-based `if/else` dispatch.
Using multiple separate `page.route()` calls causes hard-to-debug LIFO ordering conflicts
between overlapping glob patterns (e.g. `**/api/orders*` vs `**/api/orders`).

```ts
await page.route('**/*', async route => {
  const url = route.request().url();
  const method = route.request().method();

  if (url.includes('/api/auth/profile')) return route.fulfill({ json: FAKE_USER });
  if (url.includes('/api/credits/'))     return route.fulfill({ json: { balance: 150 } });
  if (url.includes('/api/config'))       return route.fulfill({ json: FAKE_STORE_CONFIG });
  // ... all other endpoints ...
  if (url.includes('/api/orders') && method === 'POST') {
    // Capture payload for assertions; fulfill with test-specific order
  }
  return route.continue();
});
```

The `FAKE_STORE_CONFIG` fixture must include `paymentSettings: { cc_payment: { enabled: true } }`
for the CC payment radio to appear (the registry's `isAvailable` guard checks this).

The `FAKE_USER` fixture must use `cashapp: '$customer-one'` (not `cashAppUsername`) to match
the field name AppContext reads from `currentUser`.

### Auth seeding

localStorage is pre-populated via `page.addInitScript()` before the page loads, which
runs synchronously before any React code:

```ts
await page.addInitScript(({ user, cart, token }) => {
  localStorage.setItem('userData', JSON.stringify(user));
  localStorage.setItem('cartData', JSON.stringify(cart));
  localStorage.setItem('authToken', token);
}, { user: FAKE_USER, cart: FAKE_CART, token: 'fake-jwt-token' });
```

This satisfies ProtectedRoute (`isGuest` check) and AppContext's auth initialization
without a real login flow.

### CC modal message format

The AuthorizeNetPaymentModal listens for **URLSearchParams-formatted string** messages
(the `communicator.html` protocol), not JSON objects:

```ts
// CORRECT — triggers cancel/failure path
window.postMessage('action=cancel', window.location.origin);

// WRONG — this format is ignored by the modal
window.postMessage({ type: 'payment_failed', ... }, '*');
```

The origin must match `window.location.origin` exactly (the modal ignores cross-origin messages).

---

## Layer 4 — Manual CC payment testing

For the full Authorize.Net card payment round-trip (requires a real HTTPS tunnel) see:

**`docs/appdocs/LOCAL_CARD_PAYMENT_TESTING.md`**

This is needed because Authorize.Net rejects `http://localhost` as a communicator origin.
The e2e suite covers the CC modal's appearance and the cancel/retry path — it does not
simulate an actual Authorize.Net transaction.

---

## Test coverage map

```
checkout flow
├── unit (Vitest backend)   → order.service.matrix.test.ts   — 14 cases, all fulfillment×payment
├── unit (Vitest backend)   → payments/registry.test.ts      — each PaymentStrategy in isolation
├── unit (Vitest backend)   → fulfillment/registry.test.ts   — each FulfillmentStrategy in isolation
├── unit (Vitest frontend)  → CheckoutPage.test.jsx           — 23+ cases inc. 6-case matrix
├── unit (Vitest frontend)  → ordersApi.test.js               — payload shape per method
├── e2e  (Playwright)       → e2e/checkout.spec.ts            — 11 browser cases
└── manual                  → LOCAL_CARD_PAYMENT_TESTING.md   — full Authorize.Net round-trip
```

---

## Adding new tests

### Adding a new payment method

1. Add a strategy file in `backend/src/services/payments/`
2. Register it in `registry.ts`
3. Add a row to the `matrix` array in `order.service.matrix.test.ts`
4. Add entries in `web/src/features/cart/checkout/paymentRegistry.js`
5. Add a case to the frontend `it.each` matrix in `CheckoutPage.test.jsx`
6. Add a Playwright test case in `e2e/checkout.spec.ts`

### Adding a new fulfillment method

Same pattern: backend strategy + registry, frontend registry, then test in all three layers.

### Vitest isolation

Each backend test file imports `OrderService` inside the test body (not at file top) when
testing with Vitest module isolation:

```ts
it('...', async () => {
  const { OrderService } = await import('./order.service');
  const service = new OrderService();
  ...
});
```

This ensures `vi.mock()` replacements are in effect before the module loads.
