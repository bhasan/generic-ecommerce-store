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
| `npm --prefix backend run test:coverage` | Backend Vitest with coverage + threshold gate |
| `npm run test:e2e` | Playwright e2e — real-backend suite (reseed + smoke + flows) + mocked checkout layer |
| `npm run test:e2e:ui` | Playwright with interactive UI explorer |

All commands run from the **workspace root** (`/smoke-station-delivery/`).

### Continuous integration

`.github/workflows/test.yml` gates every pull request (and pushes to `main`) with three jobs:

- **backend** — `prisma generate` then `npm run test:coverage` (Vitest + coverage thresholds)
- **frontend** — `npm test` (Vitest + jsdom)
- **e2e** — boots the dev stack, applies migrations, runs the full Playwright suite, uploads the report

Coverage thresholds live in `backend/vitest.config.ts` and act as a **regression ratchet**:
the floors sit just below the current baseline (≈60% lines, 68% branches, 72% functions, with
`generated/` and config excluded). Raise them as coverage improves; never lower them.

---

## Layer 1 — Backend unit tests (Vitest)

**Location:** `backend/src/**/*.test.ts`  
**Runner:** Vitest (configured in `backend/vitest.config.ts`)  
**Run:** `npm run test:backend`

### What is tested

- Service-layer logic in isolation: `order.service`, `credit.service`, `thermalPrinter.service`, etc.
  - `credit.service.test.ts` covers the money-critical paths directly: add/remove/use/refund,
    overdraw rejection, non-positive-amount guards, insufficient-balance, and the staff-username
    annotation on the transaction ledger.
- Strategy registries: `backend/src/services/payments/registry.test.ts`, `backend/src/services/fulfillment/registry.test.ts`
- Route-level validators (where they have standalone unit coverage)
- **Route-level RBAC enforcement** (`src/integration/rbac.routes.test.ts`): mounts the real
  routers with the real `authenticate` + `authorize` middleware (only the JWT decode is mocked)
  and asserts, per protected endpoint, that unauthenticated requests get 401, wrong-role tokens
  get 403, and the allowed role passes the gate. This proves the backend enforces the boundaries
  the Playwright RBAC smoke layer only checks at the frontend-redirect level.

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

**Runner:** Playwright (configured in `playwright.config.ts` at workspace root)  
**Run:** `npm run test:e2e`

The suite runs as **four Playwright projects** in one command:

| Project | Dir / match | Backend needed | Auth |
|---|---|---|---|
| `setup` | `e2e/auth.setup.ts` | Yes | Logs in per role, saves storageState |
| `smoke` | `e2e/smoke/` | Yes | storageState per role |
| `flows` | `e2e/flows/` | Yes | storageState per role |
| `mocked` | `e2e/checkout.spec.ts` | No | `addInitScript` (unchanged) |

### Prerequisites

The real-backend projects (`smoke`, `flows`) require the full dev stack running:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

Before each suite run, `e2e/global-setup.ts` automatically:
1. Polls `GET /api/health` until the backend is healthy (up to 120s)
2. Runs `prisma:seed` inside the backend container via `docker compose exec`
3. This **wipes all 14 tables** and reseeds known accounts + catalog (dev DB only)

The `mocked` project (checkout.spec.ts) never contacts the backend and runs independently.

### Real-backend projects

#### `setup` — storageState per role

`e2e/auth.setup.ts` performs a real UI login for each seeded role and saves the browser
storage state (JWT in localStorage) to `e2e/.auth/<role>.json`. The `smoke` and `flows`
projects load these files via `test.use({ storageState })`.

Seeded accounts used (defined in `e2e/helpers/accounts.ts`, mirrors `backend/prisma/seed.ts`):

| Role key | Username | Password |
|---|---|---|
| admin | admin | admin123 |
| manager | manager | manager123 |
| employee | employee | employee123 |
| customer | johncustomer | customer123 |
| driver | driver | driver123 |

`e2e/.auth/` is gitignored — these files contain real JWTs.

#### `smoke` — RBAC matrix

`e2e/smoke/rbac.spec.ts` iterates every route × every role. For authorized combinations it
asserts a visible landmark. For unauthorized-but-authenticated combinations it asserts the
redirect to `/products` (the behavior confirmed in `ProtectedRoute.jsx`).

The route→role table lives in `e2e/helpers/routes.ts` (mirrors `web/src/App.jsx`).

#### `flows` — Critical deep flows

| File | What it tests |
|---|---|
| `e2e/flows/auth.spec.ts` | Login success, bad-password error, register → pending, logout clears session |
| `e2e/flows/customer-order.spec.ts` | Browse → add to cart → PICKUP × IN_STORE checkout → order appears in my-orders |
| `e2e/flows/order-lifecycle.spec.ts` | Customer places order; manager advances PENDING → APPROVED → READY → COMPLETED |
| `e2e/flows/curbside-arrival.spec.ts` | CURBSIDE order → manager marks READY_FOR_PICKUP → customer clicks "I'm Here" → staff sees ARRIVED |
| `e2e/flows/store-credit.spec.ts` | Manager grants credit to sarahjohnson → customer checks out with CREDIT payment |
| `e2e/flows/driver-delivery.spec.ts` | Admin sets the in-zone ZIP → DELIVERY × CREDIT order → manager approves + dispatches → driver completes the delivery via the dashboard → driver RBAC boundary asserted (driver may only mark DELIVERED, never dispatch) |

**Unique-marker rule:** every flow asserts against data it uniquely created in that run
(order id from `.order-id-number`, unique vehicle make string, unique special-instructions
marker). Never assert on list count or row position — flows share seeded accounts and the
single reseed means prior orders from other flows are present in the DB.

**Capture the order id from the network response, not the success page.** The success
page pads the id (`#000094`) while every other screen shows it raw (`#94`), and parsing
the padded text has proven brittle against seeded orders. Prefer
`page.waitForResponse` on the `POST /api/orders` 201 and read `order.id`.

**Scope kanban actions to a single card.** Each `.kanban-card` carries its own inline
quick-action buttons, and the order-detail panel adds yet another set. A board-wide
`getByRole('button', …).first()` will silently act on the wrong order. Filter the card by
its exact id badge first, then click within it:

```ts
const card = page.locator('.kanban-card').filter({
  has: page.locator('.kanban-card-id', { hasText: new RegExp(`^#${orderId}$`) }),
});
await card.getByRole('button', { name: /approve \(payment verified\)/i }).click();
```

**Delivery hand-off model:** staff **dispatch** an order (`READY_FOR_DELIVERY → OUT_FOR_DELIVERY`,
via the kanban "In Delivery" action or the dashboard route-builder); the **driver** then completes
it (`OUT_FOR_DELIVERY → DELIVERED`) from the dashboard's "Out for Delivery" panel. Drivers may set
*only* `DELIVERED` and only from a deliverable state — they cannot dispatch. `driver-delivery.spec.ts`
exercises the full hand-off through the browser and asserts the driver boundary (403 on any non-
`DELIVERED` change).

> Previously the backend only accepted a driver's `DELIVERED` from `READY_FOR_DELIVERY`, while the
> dashboard's "mark delivered" button renders only on `OUT_FOR_DELIVERY` cards — so a driver could
> never finish a delivery in the UI. Fixed in `order.service.ts`: `DELIVERED` is now accepted from
> either `READY_FOR_DELIVERY` or `OUT_FOR_DELIVERY`.

### Mocked layer — `e2e/checkout.spec.ts`

11 browser tests covering the checkout fulfillment × payment matrix, validation guards, and
CC payment retry. Runs without the backend. All API traffic is mocked via `page.route()`;
auth/cart are seeded via `page.addInitScript()`. This layer's value is **request payload
assertions** (`capturedOrderBody`) and CC modal behaviour — things the real backend makes
harder to verify.

### API mocking architecture (mocked layer only)

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
