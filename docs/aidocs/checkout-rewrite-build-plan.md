# Checkout Workflow Clean Rewrite — Build Plan

> Status: **planning only — not yet implemented.**
> Strategy: full clean rewrite, executed as 8 independently-shippable steps, **backend first**.
> After **every** numbered step we stop for a check-in (implementation **and** testing) so we
> never ship a breaking change on this payment-critical path.

---

## 1. Why

The checkout flow (delivery / pickup / curbside × external / credit / in-store / CC) grew one
method at a time. Nothing is broken, but there is no shared abstraction: the code branches on
booleans (`isCC`, `isDelivery`, …) in ~6 places, so changing or adding a method means editing many
files. Target: a strategy-based design where adding a payment or fulfillment method means adding
**one file**, not editing six.

### Concrete problems being fixed
| # | Problem | Evidence |
|---|---------|----------|
| 1 | No payment/fulfillment abstraction — boolean branching duplicated | `CheckoutPage.jsx:74-79` then selector/detail/validation/submit/success/cart; `order.service.ts` create + delete-refund + `confirmCardPayment` |
| 2 | `deliveryAddress` column overloaded into 3 data types | delivery=address, curbside=`"CURBSIDE: Black Honda Civic"`, +`" \| SPOT: A-12"`; written `order.service.ts:644`, parsed/appended `:1213` |
| 3 | Notification/printing side-effects duplicated | `order.service.ts:750` and again in `confirmCardPayment` (~`:1315`) |
| 4 | No checkout state machine — ~7 overlapping flags | `CheckoutPage.jsx:61-69` |
| 5 | Address + `^\d{5}$` ZIP validation triplicated | `order.routes.ts` (×2, lines 12-19 & 59-71), `CheckoutPage.jsx:236-244`, service |

### Target architecture
**Backend**
- `PaymentStrategy` registry — each method owns `validate(ctx)`, `initialStatus()`,
  `applyInTransaction(tx, order)` (e.g. credit deduction), `notifiesOnCreate()`,
  `refundOnDelete(tx, order)`.
- `FulfillmentStrategy` registry — each method owns input shape, validation, the columns it writes,
  and check-in behavior.
- Slim `createOrder`: shared item/stock/quantity validation → fulfillment strategy → payment
  strategy → one `$transaction` → one `dispatchOrderCreatedEffects(orderId, userId)` hook (shared
  by the non-CC create path and `confirmCardPayment`).

**Frontend**
- Checkout reducer state machine: `EDITING → SUBMITTING → AWAITING_PAYMENT → SUCCESS|RETRY|CANCELLED`.
- Payment/fulfillment registries (config objects) drive selector, detail panel, validation,
  post-order action.
- Extracted components: `AddressForm`, `FulfillmentSelector`, `PaymentSelector`, `PaymentDetails`,
  shared `ErrorMessage`.

---

## 2. Conventions for every step
- **Branch:** create `refactor/checkout-rewrite` off `feature/cc_payment` before Step 1 (confirm with user).
- **Migrations:** hand-written SQL in `backend/prisma/migrations/<timestamp>_<name>/migration.sql`
  matching existing style (see `20260612000000_…`). Keep `schema.prisma` in sync.
- **Tests:** backend `npm test` (vitest) in `backend/`; frontend `npm test` in `web/`. Add/adjust
  tests in the same step. CC paths use `docs/appdocs/LOCAL_CARD_PAYMENT_TESTING.md`.
- **Check-in gate per step:** all existing tests green + new tests green + manual smoke of the
  method(s) touched + a one-paragraph summary of what changed and what was verified.

---

## Phase A — Backend data model

### Step 1 — Additive curbside + handle columns + backfill (additive dual-write)
**Goal:** make curbside/handle data available as structured columns with **zero reader/behavior
change**. New orders write both the structured columns *and* the legacy `deliveryAddress` string
(still the source of truth for all current readers). Backfill makes the structured data exist for
old rows too. Reader cut-over is deferred to a later, isolated step.

**Schema** (`backend/prisma/schema.prisma`, `Order` model — after `deliveryAddress`):
```prisma
vehicleDescription  String?   // curbside vehicle, e.g. "Black Honda Civic"
parkingSpot         String?   // curbside check-in spot, e.g. "A-12"
paymentHandle       String?   // $cashtag/zelle/venmo actually used at order time (audit snapshot)
```

**Migration** `…_add_order_curbside_and_payment_handle/migration.sql`:
```sql
ALTER TABLE "orders" ADD COLUMN "vehicleDescription" TEXT;
ALTER TABLE "orders" ADD COLUMN "parkingSpot" TEXT;
ALTER TABLE "orders" ADD COLUMN "paymentHandle" TEXT;

-- Backfill legacy CURBSIDE rows: deliveryAddress = "CURBSIDE: <vehicle>" optionally "| SPOT: <spot>"
UPDATE "orders"
SET "parkingSpot" = NULLIF(TRIM(SPLIT_PART("deliveryAddress", '| SPOT:', 2)), ''),
    "vehicleDescription" = NULLIF(TRIM(REGEXP_REPLACE(
        SPLIT_PART("deliveryAddress", '| SPOT:', 1), '^\s*CURBSIDE:\s*', '')), '')
WHERE "deliveryMethod" = 'CURBSIDE' AND "deliveryAddress" IS NOT NULL;
```

**New helper** `backend/src/utils/curbside.ts` (pure, reused in Step 4):
- `parseCurbsideAddress(raw: string | null): { vehicleDescription: string | null; parkingSpot: string | null }`
  — handles both `"CURBSIDE: <v>"` and `"CURBSIDE: <v> | SPOT: <s>"`.
- `formatCurbsideAddress({ vehicleDescription, parkingSpot }): string` — rebuilds the legacy string
  (used to keep dual-write consistent during transition).

**Service writes** (`order.service.ts`):
- `createOrder` curbside branch (`~:644`): keep writing `deliveryAddress`; additionally set
  `vehicleDescription` (= `parseCurbsideAddress(incoming).vehicleDescription`). Set
  `paymentHandle = cashAppUsername?.trim() || null` in the `order.create` data for all methods.
- `customerArrive` (`~:1212-1227`): keep appending to `deliveryAddress`; additionally set
  `parkingSpot: parkingSpot.trim()`.

**Readers:** unchanged this step (still read `deliveryAddress`). No frontend changes.

**Tests:**
- New `curbside.ts` unit tests (parse/format round-trip, missing spot, no prefix).
- Extend `order.service.test.ts`: curbside create populates `vehicleDescription` + legacy string;
  `customerArrive` sets `parkingSpot` + legacy string; `paymentHandle` set from cashapp.
- Migration backfill: assert SQL parses a representative legacy value correctly (or doc a manual
  check on a seeded row). Run `SELECT` before to confirm distinct legacy shapes.
- All existing backend tests stay green (they still assert on `deliveryAddress`).

**Check-in:** new columns populated on create + arrive + backfill; nothing in display changed.

---

### Step 2 — Convert `deliveryMethod` / `paymentMethod` to Prisma enums
**Goal:** DB-level validation + type-safe strategies.

**Pre-check (run first):** `SELECT DISTINCT "deliveryMethod", "paymentMethod" FROM "orders";`
confirm every value is one of the `orderMethods.ts` tokens.

**Schema:**
```prisma
enum DeliveryMethodEnum { DELIVERY PICKUP CURBSIDE }
enum PaymentMethodEnum  { EXTERNAL CREDIT IN_STORE CC }
// Order:
deliveryMethod  DeliveryMethodEnum  @default(DELIVERY)
paymentMethod   PaymentMethodEnum   @default(EXTERNAL)
```

**Migration** `…_convert_order_method_columns_to_enums/migration.sql`:
```sql
CREATE TYPE "DeliveryMethodEnum" AS ENUM ('DELIVERY','PICKUP','CURBSIDE');
CREATE TYPE "PaymentMethodEnum"  AS ENUM ('EXTERNAL','CREDIT','IN_STORE','CC');
ALTER TABLE "orders"
  ALTER COLUMN "deliveryMethod" DROP DEFAULT,
  ALTER COLUMN "deliveryMethod" TYPE "DeliveryMethodEnum" USING "deliveryMethod"::"DeliveryMethodEnum",
  ALTER COLUMN "deliveryMethod" SET DEFAULT 'DELIVERY',
  ALTER COLUMN "paymentMethod"  DROP DEFAULT,
  ALTER COLUMN "paymentMethod"  TYPE "PaymentMethodEnum"  USING "paymentMethod"::"PaymentMethodEnum",
  ALTER COLUMN "paymentMethod"  SET DEFAULT 'EXTERNAL';
```

**Code:** Prisma now types these as enums. `orderMethods.ts` string constants still align — keep
them as the single naming source; cast at the Prisma boundary where needed. Fix any TS type errors.

**Tests:** existing orders unaffected; create one order of each method; invalid value rejected by
DB/Prisma. Full backend suite green.

**Check-in:** enums live, no data lost, all method combos still create.

---

## Phase B — Backend strategy refactor (behavior-preserving)

### Step 3 — `PaymentStrategy` registry
**Goal:** collapse the scattered `if (paymentMethod === …)` branches and de-duplicate side-effects.

**New** `backend/src/services/payments/`:
- `PaymentStrategy.ts` — interface:
  ```ts
  interface PaymentStrategy {
    method: PaymentMethodEnum;
    validate(ctx: OrderContext): void;                 // e.g. IN_STORE requires pickup/curbside; credit balance
    initialStatus(): OrderStatus;                      // CC → PENDING_PAYMENT else PENDING
    applyInTransaction(tx, order, ctx): Promise<void>; // CREDIT → creditService.useCredit
    notifiesOnCreate(): boolean;                        // CC → false (deferred to confirm)
    refundOnDelete(tx, order): Promise<void>;          // CREDIT → refund
  }
  ```
- `external.strategy.ts`, `credit.strategy.ts`, `inStore.strategy.ts`, `cc.strategy.ts`
- `registry.ts` — `getPaymentStrategy(method): PaymentStrategy`.

**Shared effect** `dispatchOrderCreatedEffects(orderId, userId)` (new fn in `order.service.ts` or a
small `orderEffects.ts`) wrapping the notify + thermal-printer block. Call it from the create path
when `strategy.notifiesOnCreate()` and from `confirmCardPayment` — replacing both copies.

**Refactor** `order.service.ts`: replace `isCredit`, the IN_STORE guard (`:521`), the status
ternary (`:633`), the credit call (`:694`), the CC notify-skip (`:750`), and the delete-refund
(`:1155`) with strategy calls.

**Tests:** per-method end-to-end — CC token+verify (runbook), credit deduct + refund-on-delete,
external, in-store. Assert notify/printer fires exactly once per order on the correct path. Full
suite green.

**Check-in:** payment behavior identical; logic centralized; duplicate effect block gone.

---

### Step 4 — `FulfillmentStrategy` registry
**Goal:** collapse fulfillment branching and kill the overloaded-address handling at its source.

**New** `backend/src/services/fulfillment/`:
- `FulfillmentStrategy.ts` — interface:
  ```ts
  interface FulfillmentStrategy {
    method: DeliveryMethodEnum;
    validate(ctx): Promise<void>;          // delivery: eligibility + minimum; curbside: vehicle required
    buildOrderFields(ctx): Promise<Partial<Order>>; // delivery: address+zone snapshot; curbside: vehicleDescription
    onCheckIn?(tx, order, parkingSpot): Promise<Partial<Order>>; // curbside only
  }
  ```
- `delivery.strategy.ts` (owns eligibility call + zone snapshot + user address update),
  `pickup.strategy.ts`, `curbside.strategy.ts` (owns `vehicleDescription` + `parkingSpot`).
- `registry.ts`.

**Shared validator** `backend/src/validators/deliveryAddress.ts` — one address+ZIP validator reused
by `order.routes.ts` (replace the two inline copies) and the delivery strategy.

**Refactor** `order.service.ts`: `createOrder` delegates fulfillment fields/validation to the
strategy; `customerArrive` delegates to `curbside.onCheckIn`. Curbside now writes structured columns
as the primary representation (legacy string still dual-written until Step 8 reader cut-over).

**Tests:** each fulfillment method; eligibility in-zone / out-of-zone / ZIP-fallback /
minimum-order-block; curbside check-in writes `parkingSpot`. Full suite green.

**Check-in:** fulfillment behavior identical; address validation single-sourced.

---

### Step 5 — Slim `createOrder` orchestrator + clean API contract
**Goal:** `createOrder` becomes a thin orchestrator; request DTO stops smuggling vehicle data in a
string.

**Orchestrator** (`order.service.ts`): shared item/stock/quantity validation → fulfillment strategy
→ payment strategy → single `$transaction` → `dispatchOrderCreatedEffects`. Target: the method body
fits on a screen.

**API contract:**
- Request DTO gains structured `vehicle?: { makeModel: string; color: string }` instead of the
  crammed `deliveryAddress` string for curbside. Update `order.routes.ts` validators
  (`backend/src/routes/order.routes.ts:42-74`) and `order.controller.ts`.
- **Back-compat (DECIDED — Option A):** the backend accepts *both* the new `vehicle` object and the
  legacy `"CURBSIDE: …"` string, translating the legacy form server-side, until the frontend ships
  Step 7. The shim is removed in Step 8. (No route versioning.)

**Tests:** full backend regression across all fulfillment × payment combinations (see matrix below).

**Check-in:** orchestrator readable; new DTO accepted; old DTO still works; full matrix green.

---

## Phase C — Frontend rewrite (against the clean API)

### Step 6 — Checkout state machine
**Goal:** replace the ~7 overlapping flags with one reducer; UI output unchanged.

**New** `web/src/features/cart/checkout/checkoutMachine.js` — reducer with states
`EDITING → SUBMITTING → AWAITING_PAYMENT → SUCCESS | RETRY | CANCELLED` and actions
(`submit`, `orderCreated`, `paymentTokenReady`, `paymentSucceeded`, `paymentFailed`, `cancel`).

**Refactor** `CheckoutPage.jsx` (`:61-69`, `handlePlaceOrder` `:278-342`, modal callbacks
`:345-472`): drive flow from the reducer; delete `isSubmitting`/`showSendPaymentModal`/
`ccPaymentModal`/`paymentRetryOrder`/`orderCancelled`/`orderCompleted`/`pendingOrderState` flags and
the compound guards (`:205-211`).

**Tests:** `web` tests — success, external-payment cancel (cart restored), CC failure→retry, CC
success. Existing checkout tests green.

**Check-in:** identical UX, one state source.

---

### Step 7 — Frontend registries + extracted components
**Goal:** config-driven selector/detail/validation/submission; reusable components; structured
vehicle payload.

**New** `web/src/features/cart/checkout/`:
- `paymentRegistry.js` — per-method `{ label, icon, isAvailable(ctx), validate(ctx), renderDetails,
  postOrderAction }`.
- `fulfillmentRegistry.js` — per-method `{ label, validate(ctx), buildPayload(ctx), renderFields }`.
- Components: `AddressForm.jsx`, `FulfillmentSelector.jsx`, `PaymentSelector.jsx`,
  `PaymentDetails.jsx`, shared `ErrorMessage.jsx`.

**Refactor** `CheckoutPage.jsx` to compose registries+components; `validateForm` becomes a loop over
the active strategies. `AppContext.checkout()` (`~:731`) and `ordersApi.js` (`:37-47`) send the
structured `vehicle` object (Step 5 contract) instead of the `"CURBSIDE: …"` string.

**Tests:** each method renders/validates/submits; field-level errors display; `ordersApi.test.js`
updated to new payload.

**Check-in:** adding a method now = one registry entry.

---

### Step 8 — Align success/cart pages + remove dead code
**Goal:** finish reader cut-over and delete the bridges.

- `OrderSuccessPage.jsx` + `CartPage.jsx` consume registries; remove their boolean branches.
- **Backend reader cut-over:** `thermalPrinter.service.ts:157-166` and frontend order displays
  (`OrderDetailPanel`, `OrdersWorkflow`, `CustomerOrderList`) read `vehicleDescription`/`parkingSpot`
  instead of parsing `deliveryAddress`. Surface these fields in the order API response.
- Stop dual-writing the legacy curbside string in `createOrder`/`customerArrive`; remove
  `parseCurbsideAddress` legacy-string usage and the Step 5 back-compat DTO shim.
- Update the tests that still assert on the `"CURBSIDE: … | SPOT: …"` string
  (`order.service.test.ts`, `thermalPrinter.service.test.ts`, `order.routes.test.ts`,
  `ordersApi.test.js`, `OrderDetailPanel.test.jsx`, `OrdersWorkflow.test.jsx`).

**Tests:** full end-to-end smoke of every method + the regression matrix. Grep confirms no remaining
references to the legacy string format.

**Check-in:** overloaded column retired; rewrite complete.

---

## Verification

**Regression matrix** (run after Step 5 and Step 8):
delivery+external · delivery+CC · delivery+credit · pickup+in-store · pickup+CC ·
curbside+in-store · curbside+credit — plus curbside check-in, external-payment cancel/restore, and
CC failure→retry.

**Per step:** backend `npm test`; frontend `npm test`; run the app (`/run` or `/verify`) and
exercise the touched method(s); CC via `docs/appdocs/LOCAL_CARD_PAYMENT_TESTING.md`.

**Data safety:** before Step 2 run `SELECT DISTINCT "deliveryMethod","paymentMethod" FROM "orders"`;
after Step 1 verify backfilled curbside rows and confirm legacy rows still render.

---

## Critical files
**Backend:** `prisma/schema.prisma`; `src/services/order.service.ts` (createOrder ~495-775,
customerArrive ~1184, confirmCardPayment ~1292, delete-refund ~1155); `src/routes/order.routes.ts`
(12-74); `src/services/thermalPrinter.service.ts` (121-167); `src/constants/orderMethods.ts`;
`src/services/authorizenet.service.ts`, `credit.service.ts`; new `src/services/payments/`,
`src/services/fulfillment/`, `src/utils/curbside.ts`, `src/validators/deliveryAddress.ts`.

**Frontend:** `web/src/features/cart/CheckoutPage.jsx`; `web/src/context/AppContext.jsx`
(checkout ~731); `web/src/services/ordersApi.js`; `OrderSuccessPage.jsx`, `CartPage.jsx`,
`AuthorizeNetPaymentModal.jsx`, `components/common/SendPaymentModal.jsx`; order displays
`features/orders/{OrderDetailPanel,OrdersWorkflow,CustomerOrderList}.jsx`; new
`web/src/features/cart/checkout/`.
