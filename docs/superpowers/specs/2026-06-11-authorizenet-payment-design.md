# Authorize.net Payment Integration Design

**Date:** 2026-06-11  
**Branch:** feature/cc_payment  
**Status:** Approved — ready for implementation planning

---

## Overview

Add Credit/Debit Card payment via Authorize.net Accept Hosted (iFrame) as a new, toggleable payment method alongside the existing EXTERNAL (CashApp/Zelle/Venmo), CREDIT, and IN_STORE methods. The integration uses a "order first, pay later" flow consistent with the existing checkout pattern.

---

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Integration style | Accept Hosted (iFrame) | Zero card data on our servers, low PCI scope, smooth UX |
| Payment timing | Order first, then payment | Consistent with existing EXTERNAL flow |
| iFrame UX | Modal with postMessage | Customer stays on page, no full-page redirect |
| Credential storage | Admin panel (Website Management) | No redeploy needed to update keys |
| Credential display | Collapsible section, transaction key masked | Security UX best practice |
| Failed/abandoned orders | Customer can retry | No auto-cancel complexity |

---

## Architecture

### Payment Flow (Happy Path)

```
1. Checkout     Customer selects "Credit/Debit Card", clicks "Place Order & Pay"
2. Order create Backend creates order with status PENDING_PAYMENT
3. Token fetch  Frontend calls POST /api/orders/:id/payment/token
                  → Backend calls Authorize.net getHostedPaymentPageRequest
                  → Returns short-lived hosted page token
4. iFrame modal Frontend renders Accept Hosted iFrame in modal
                  → Customer enters card details on Authorize.net's servers
                  → Authorize.net pings communicator.html via redirect
                  → communicator.html postMessages result to parent window
5. Verify       On success postMessage, frontend calls POST /api/orders/:id/payment/verify
                  → Backend calls Authorize.net to verify transId and amount
                  → Order status updated to PENDING (enters existing confirmed flow)
```

### Checkout Flow Changes

The current checkout page will be updated to match the mockup design: payment method selection is presented as radio options with contextual detail shown for the selected method. This is a UX improvement that applies to all payment methods, not just CC — flagged as a checkout UX follow-on that should be implemented together with the CC option.

---

## Backend Components

### New: `authorizenet.service.ts`

Wraps the `authorizenet` npm SDK. Stateless — reads credentials from the settings service on each call so credential updates take effect immediately without restart.

**Methods:**
- `getHostedPageToken(orderId: number, amount: number, settings: CCPaymentSettings): Promise<string>` — Calls `getHostedPaymentPageRequest` with the order amount, the order ID as the transaction's invoice number (binds the payment to this specific order), and a `returnUrl` pointing to `communicator.html`. Returns the token string.
- `verifyTransaction(transId: string, expectedAmount: number, expectedOrderId: number, settings: CCPaymentSettings): Promise<void>` — Calls `getTransactionDetailsRequest`, confirms status is `settledSuccessfully` or `capturedPendingSettlement`, that the amount matches, and that the transaction's invoice number matches `expectedOrderId`. Throws `AppError` on mismatch or failure. Combined with a unique constraint on `Order.transactionId`, this prevents one payment from confirming multiple orders (replay).

Both methods switch between sandbox (`apitest.authorize.net`) and production (`api2.authorize.net`) based on `settings.sandboxMode`.

### Modified: `paymentSettings.service.ts`

Extended `PaymentSettings` interface:

```typescript
export interface CCPaymentSettings {
  enabled: boolean;
  loginId: string;
  transactionKey: string;
  sandboxMode: boolean;
}

export interface PaymentSettings {
  cashapp: PaymentMethodSettings;
  zelle: PaymentMethodSettings;
  venmo: PaymentMethodSettings;
  cc_payment: CCPaymentSettings;
}
```

Default: `cc_payment: { enabled: false, loginId: '', transactionKey: '', sandboxMode: true }`.

Validation: if `cc_payment.enabled` is `true`, `loginId` and `transactionKey` must be non-empty strings, max 64 chars each.

The transaction key is stored as-is in the `UiSetting` JSON blob — it is not encrypted at rest. Access to the admin panel already requires admin role authentication.

### New Routes: `order.routes.ts` + `order.controller.ts`

**`POST /api/orders/:id/payment/token`**
- Auth: authenticated, order must belong to the calling user
- Order must have status `PENDING_PAYMENT`
- `cc_payment` must be enabled in settings
- Returns: `{ token: string }`
- On failure: deletes the order and returns an error (cart restore is handled client-side)

**`POST /api/orders/:id/payment/verify`**
- Auth: authenticated, order must belong to the calling user
- Body: `{ transId: string }`
- Calls `authorizenet.service.verifyTransaction`
- On success: updates order `status → PENDING`, sets `transactionId = transId`
- On failure: leaves order as `PENDING_PAYMENT`, returns error for client to display

### Database Migration

```prisma
// Add to OrderStatus enum
PENDING_PAYMENT

// Add to Order model
transactionId  String?  @unique
```

`PENDING_PAYMENT` is distinct from `PENDING` — it means the order exists but payment has not been confirmed. Staff dashboards filter on `PENDING` and above, so `PENDING_PAYMENT` orders are invisible to staff until payment completes.

---

## Frontend Components

### Modified: `CheckoutPage.jsx`

- Add `CC` option to payment method radio group, rendered only when `paymentSettings?.cc_payment?.enabled`
- Add `PaymentMethod.CC = 'CC'` to `web/src/constants/orderMethods.js`
- When CC is selected, CTA text changes to "Place Order & Pay →"
- On CC submit: create order → request token → open `AuthorizeNetPaymentModal`
- On token request failure: delete order, restore cart, show error toast (matches existing EXTERNAL failure recovery)
- Existing EXTERNAL/CREDIT/IN_STORE submit paths are unchanged

### New: `AuthorizeNetPaymentModal.jsx`

Props: `{ orderId, token, amount, onSuccess, onFailure, onClose }`

- Renders `<iframe src="https://accept[test].authorize.net/payment/payment?token={token}" />`
- Listens for `window.message` events from `communicator.html`
- On success message: calls `POST /api/orders/:id/payment/verify`, then calls `onSuccess()`
- On failure/cancel message: calls `onFailure()` — parent shows retry card
- On modal close (X button): calls `onClose()` — order stays `PENDING_PAYMENT`, retry available from Order History
- Shows inline spinner while verify call is in-flight

### New: `public/communicator.html` (static asset)

A ~15-line HTML file served from the frontend's `public/` directory. Authorize.net redirects to this URL after payment, passing result params. The page calls `window.opener.postMessage(...)` or `window.parent.postMessage(...)` with the result and closes itself.

URL configured in the `getHostedPaymentPageRequest` as the `hostedPaymentReturnOptions.url`.

### Modified: `WebsitePaymentSection.jsx`

- Adds Authorize.net card above existing CashApp/Zelle/Venmo rows
- Card contains: enabled toggle + collapsible "API Credentials" section
- Credentials section contains: API Login ID (text input), Transaction Key (password input with eye toggle), Sandbox/Test Mode toggle, Save button, and a warning banner
- On save: calls existing `updatePaymentSettings` API with the extended payload

---

## Error Handling

| Scenario | Behavior |
|---|---|
| Token request fails | Order deleted, cart restored, toast error shown |
| Payment declined | postMessage failure → modal closes → retry card shown on checkout |
| User closes modal | Order stays `PENDING_PAYMENT`, banner prompts retry. Retry available from Order History. |
| Verify endpoint fails after success postMessage | Error shown in modal: "Payment may have gone through — contact support with order #XXXX." Order stays `PENDING_PAYMENT` for staff manual resolution. |
| Bad credentials (admin misconfigured) | Token request returns 401-equivalent from Authorize.net → caught as AppError, surfaced as checkout error |

---

## Follow-on Work (Out of Scope for This Feature)

- ~~**Checkout UX refresh**~~ — **Moved in scope (2026-06-12).** The payment-section radio-card refresh for all payment methods is now Task 8 of the implementation plan, sequenced *before* the CC checkout task so the CC option is built onto the new structure. Reference design: radio cards (icon + name + meta badge) with a single contextual detail box for the selected method.
- **Credential encryption at rest** — Consider encrypting `loginId` and `transactionKey` in the `UiSetting` JSON using a server-side key. Not required for launch given admin-only access.
- **Refund flow** — Authorize.net supports refunds via API. Not in scope for initial integration.
