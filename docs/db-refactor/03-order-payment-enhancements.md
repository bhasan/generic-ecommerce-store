# Phase 3 — Order & Payment Enhancements

## Goal
The "scale" additions that aren't strictly cleanup: an auditable order **status history**,
and a dedicated **Payment** table supporting multiple attempts/refunds (Authorize.Net).
Run last, once the foundation and catalog are in place.

> Depends on Phase 1 (Order relations + Decimal money) and Phase 2 (variants).

## Target schema changes
```
OrderStatusEvent                     // NEW — replaces implicit status tracking
  id, orderId -> orders (onDelete: Cascade)
  fromStatus OrderStatus?, toStatus OrderStatus, changedBy Int? -> users (SetNull)
  note String?, createdAt
  @@index([orderId, createdAt])

Payment                              // NEW — payment details move off Order
  id, orderId -> orders (onDelete: Cascade)
  method PaymentMethodEnum, status PaymentStatus
  amount Decimal(12,2)
  transactionId String? @unique       // gateway id (moved off orders.transactionId)
  gatewayResponse Json?               // raw Authorize.Net payload
  createdAt, updatedAt
  @@index([orderId])  @@index([status])

enum PaymentStatus { PENDING AUTHORIZED CAPTURED SETTLED FAILED REFUNDED VOIDED }
```
`orders` keeps `paymentMethod` (the chosen method) but the transaction record(s) live in
`Payment`. `orders.transactionId` / `paymentHandle` are superseded.

## Migration
Additive (new tables). Move the `transactionId` unique off `orders` once `Payment` exists.
With no real orders, no backfill needed.

## Backend changes
- `services/order.service.ts` — status transitions write an `OrderStatusEvent` in the same
  transaction; expose an order-history endpoint; read payment state from `Payment`.
- `services/authorizenet.service.ts` — persist a `Payment` row per attempt with
  `gatewayResponse`; compare settled vs expected as `Decimal` equality and **remove the
  `±0.01` float tolerance**.

## Frontend changes (`web/src`)
- `features/orders/OrderDetailPanel.jsx` — status timeline from `statusEvents`; show
  `Payment` record(s) (method/status/amount/txn) instead of the single Order field;
  supports refunds/retries.
- `features/orders/OrdersPage.jsx`, `features/cart/OrderSuccessPage.jsx`,
  `services/ordersApi.js` — read payment confirmation from `payments[]`.

## API contract impact
- **Additive:** order responses gain `statusEvents[]` and `payments[]`.
- **Breaking (narrow):** consumers reading the single `orders.transactionId` switch to the
  latest `Payment`.

## Tests & verification
- `order.service*.test.ts` — status-history creation; `authorizenet.service` tests —
  Payment persistence across authorized→captured→settled, failure, refund; exact-amount
  match without tolerance.
- `OrderDetailPanel.test.jsx`, `OrdersPage.test.jsx`, `OrderSuccessPage.test.jsx`,
  `ordersApi.test.js` — payment/timeline fixtures.
</content>
