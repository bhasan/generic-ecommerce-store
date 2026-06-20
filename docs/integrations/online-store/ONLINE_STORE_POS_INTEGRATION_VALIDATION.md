# Online Store POS Integration Validation

## 1. Executive Summary

The online store already owns a complete order workflow: browser-local cart, checkout, backend order creation, stock validation/decrement, staff order review, delivery/pickup statuses, notifications, and a print-job queue. There is no existing SAK, Forever POS, Physalia, terminal, warehouse, SKU, barcode, POS transaction, or POS ticket integration in this repository.

The biggest POS decision is whether online orders should become real POS orders or only create POS/staff notifications while staff rings the sale manually. If SAK/Forever POS must own inventory and transaction truth at launch, the delivery app needs inventory sync, product identifier mapping, and POS order/payment/transaction linkage before launch. If the app can launch with its own inventory and manual POS ringing, the minimum POS requirement is a reliable staff-facing notification/print handoff plus later reconciliation exports/events.

Current code strongly supports an initial "online order notification + app order record + print ticket + staff manual action" model. It does not yet support automated POS order creation, POS payment posting, POS inventory movement, POS acceptance/rejection callbacks, or POS transaction reconciliation.

## 2. Current Online Store Order Flow

### Cart Creation

- Cart state is maintained client-side in `web/src/context/AppContext.jsx` and persisted to `localStorage` under `cartData`.
- `addToCart`, `removeFromCart`, and `updateCartQuantity` operate on local React state. Cart rows use the app product `id` as the product reference.
- There is a `CartItem` Prisma model, but the inspected frontend flow does not use backend cart routes; no backend cart routes were found.
- Product pages and grids block adding out-of-stock items when `stockEnabled !== false` and `stock === 0`, but cart contents are still revalidated by the backend during checkout.

### Checkout

- Checkout submits `items: [{ productId, quantity }]`, `deliveryMethod`, `paymentMethod`, optional `cashAppUsername`, and optional `deliveryAddress` to `POST /api/orders`.
- Backend checkout validates delivery method, payment method, non-empty items, product existence, allowed quantities, stock, delivery minimum, and delivery eligibility.
- The backend calculates subtotal from current product prices and quantity discount rules, calculates tax using `DEFAULT_TAX_RATE`, and persists `Order` plus `OrderItem` records in a transaction.
- Stock-enabled products are decremented during order creation, not at staff approval.

### Pickup vs Delivery

- Delivery methods are `DELIVERY`, `PICKUP`, and `CURBSIDE`.
- Delivery checkout performs a frontend eligibility check through `POST /api/orders/delivery-eligibility`, then the backend rechecks eligibility during order creation.
- Delivery orders store a canonical delivery address and delivery zone metadata when eligibility is available.
- Pickup and curbside orders do not require delivery eligibility. Curbside stores vehicle details in `deliveryAddress` and supports a later customer arrival check-in.

### Payment Method Handling

- Payment methods are `EXTERNAL`, `CREDIT`, `IN_STORE`, and `CC`.
- `EXTERNAL` means the app creates the order, then asks the customer to send payment externally through configured Cash App/Zelle/Venmo-style instructions. Staff sees pending external payment as needing verification.
- `CREDIT` deducts store credit during order creation and creates a `CreditTransaction` of type `USED`.
- `IN_STORE` is allowed only for `PICKUP` and `CURBSIDE`; it is rejected for delivery.
- `CC` creates an order in `PENDING_PAYMENT`, requests an Authorize.Net Accept Hosted token, and only transitions to `PENDING` after `verifyPayment` confirms the transaction and stores `transactionId`.
- For non-card orders, order-created notifications and print jobs are queued immediately after order creation. For card orders, those side effects happen only after payment confirmation.

### Staff Order Review

- Staff and management users use `web/src/features/orders/OrdersPage.jsx`, a kanban-style order board.
- Staff can approve or reject pending orders:
  - `PENDING -> APPROVED` means payment was verified / order accepted.
  - `PENDING -> NOT_FULFILLING` is labeled as rejection due to invalid payment.
- Staff can move approved orders to fulfillment statuses, edit order items, add items, void items, delete items, delete orders if admin, and manually print receipts.
- Staff can also drag orders between status columns; the backend accepts any valid status from employee/management/admin roles.

### Status Transitions

Implemented statuses are:

- `PENDING_PAYMENT`
- `PENDING`
- `APPROVED`
- `NOT_FULFILLING`
- `READY_FOR_DELIVERY`
- `OUT_FOR_DELIVERY`
- `DELIVERED`
- `READY_FOR_PICKUP`
- `ARRIVED`
- `PICKED_UP`

Primary UI quick-action flow:

- Delivery: `PENDING -> APPROVED -> READY_FOR_DELIVERY -> OUT_FOR_DELIVERY -> DELIVERED`
- Pickup: `PENDING -> APPROVED -> READY_FOR_PICKUP -> PICKED_UP`
- Curbside: `PENDING -> APPROVED -> READY_FOR_PICKUP -> ARRIVED -> PICKED_UP`
- Rejection: `PENDING -> NOT_FULFILLING`
- Card payment: `PENDING_PAYMENT -> PENDING` only after Authorize.Net verification.

### Delivery Driver Flow

- The driver dashboard reads `READY_FOR_DELIVERY` and `OUT_FOR_DELIVERY` order buckets.
- Drivers build a route by moving selected orders from `READY_FOR_DELIVERY` to `OUT_FOR_DELIVERY`.
- Drivers mark route orders as `DELIVERED`.
- Backend delivery-driver role restrictions only allow delivery drivers to set `DELIVERED`, and only from `READY_FOR_DELIVERY`. This conflicts with the driver dashboard's use of `OUT_FOR_DELIVERY -> DELIVERED`; needs verification in live role testing.
- There is no persisted `driverId`, route entity, assignment table, or delivery handoff record.

### Cancellation, Rejection, Void, Refund

- Rejection is represented by `NOT_FULFILLING`; no separate cancellation model was found.
- Admin order delete permanently deletes the order and refunds store credit if the order used `CREDIT`.
- External-payment and card retry/cancel flows call order delete and restore the local cart.
- Item void marks an order item `voided` and recalculates order total. It does not restore product stock.
- Item delete removes the item and recalculates total. It does not restore product stock.
- Order delete does not restore product stock, despite a comment claiming stock restoration.
- No card refund, external-payment refund, POS void, or POS cancellation integration was found.

### Print Job Handling

- New non-card orders and confirmed card orders call `thermalPrinterService.dispatchReceipt(orderId, 'ORDER_CREATED')`.
- Manual staff reprints call `POST /api/orders/:id/print`, which dispatches `MANUAL_REPRINT`.
- Print jobs are stored in `print_jobs` with `PENDING`, `CLAIMED`, `PRINTED`, and `FAILED`.
- A print agent can claim the next job and report success/failure through `/api/print-jobs` routes using `x-print-agent-key`.
- The receipt payload contains order id, status, total, delivery method, payment method, customer info, delivery address, product ids/names/categories, quantities, unit prices, void flags, and receipt text.

### Notification Handling

- Order creation creates in-app/staff notifications for employee, management, and admin users and can forward to Make webhooks as `ops_alert`.
- Order status updates notify the customer. Some statuses also notify driver/admin roles and/or Make.
- Staff notification counts are based on unfulfilled order status buckets plus pending registrations.
- Notifications are app/Make-oriented, not SAK/POS-oriented.

## 3. Current Inventory Behavior

| Question | Classification | Code-based answer |
| --- | --- | --- |
| Does the online store currently decrement inventory? | IMPLEMENTED | Yes. `createOrder` decrements `ProductItem.stock` for each stock-enabled product during order creation. `addItemToOrder` also decrements stock for added items. |
| Does it check stock before checkout? | PARTIAL | Product UI disables add for zero stock, and backend checkout checks stock before creating the order. It does not continuously reserve/check every cart change against the server. |
| Does it reserve inventory? | PARTIAL | Stock is decremented at order creation, even before staff approval. This acts like immediate reservation/sale in the app inventory, but there is no separate reservation table or expiry. |
| Does staff approval affect inventory? | NOT_IMPLEMENTED | Inventory is already decremented before `APPROVED`. Approval/rejection does not apply inventory movement. |
| Does delivery completion affect inventory? | NOT_IMPLEMENTED | `DELIVERED` and `PICKED_UP` are status-only transitions. |
| What happens if online stock and POS stock disagree? | NEEDS_VERIFICATION | No POS stock source exists in this repo. The app uses its own `products.stock` and has no stale-sync policy. |
| Is there a product ID/SKU/barcode field that can map to POS? | PARTIAL | App product `id` exists, but no SKU/barcode/UPC/POS product id fields exist in Prisma schema, product routes, CSV import, or product forms. A mapping field is needed. |
| Is the catalog manually managed or POS-synced? | IMPLEMENTED | Manually managed in the app through product create/update/delete and CSV import/export. No POS sync code was found. |

Important inventory risks:

- Stock decrements for `PENDING` external-payment orders before staff verifies payment.
- `NOT_FULFILLING`, item void, item delete, and order delete do not restore stock.
- There is no POS inventory conflict resolution, stale inventory guard, or stock movement audit trail.

## 4. Required POS Handoff Model

| Handoff item | Classification | Recommendation |
| --- | --- | --- |
| Online order created notification | REQUIRED_FOR_LAUNCH | Staff/POS must see new online orders quickly. Current app supports staff notifications, Make webhooks, and print tickets; SAK terminal notification is only required if POS is the operator surface. |
| Full online order payload | REQUIRED_FOR_LAUNCH | Required for fulfillment, printing, and reconciliation. Payload should include order, customer contact, method, address/vehicle, line items, taxes/fees/discounts, payment method, and notes. |
| POS order creation | NEEDS_DECISION | Required only if online orders should become real POS tickets/orders automatically. Current code does not do this. |
| POS payment record | REQUIRED_FOR_RECONCILIATION | Needed to connect Authorize.Net/store credit/external/in-store payments to POS transactions. Becomes launch-critical if POS must show paid status. |
| POS inventory decrement | NEEDS_DECISION | Current app decrements its own stock. If POS is inventory source of truth, POS inventory decrement/sync is required for launch. |
| POS staff acceptance/rejection | NEEDS_DECISION | Current acceptance/rejection happens in the app. Required if staff will accept/reject from POS. |
| POS order status update | NEEDS_DECISION | Required if POS owns fulfillment status. Otherwise app remains status source and POS receives notifications only. |
| POS cancellation | REQUIRED_FOR_RECONCILIATION | Needed to keep POS/app/Physalia aligned for rejected, deleted, refunded, or voided orders. Current app lacks a complete cancellation model. |
| POS receipt/print command | OPTIONAL | Current app has a print queue. POS print command is optional unless receipts must print through SAK/Forever POS terminals. |
| POS terminal bubble notification | NEEDS_DECISION | Useful if POS terminals are primary staff alerting surface. Current fallback is app notification/Make/print. |
| POS online order screen notification | NEEDS_DECISION | Required if SAK provides an online order screen and staff should work from POS instead of the app. |

Minimum viable launch model if POS endpoints are limited:

1. Delivery app remains order/status/inventory source for online orders.
2. New online orders notify staff through existing app/Make notifications and print queue.
3. Staff manually rings accepted orders in POS.
4. Physalia reconciles using app order export/events plus POS reports.
5. Product mapping and POS transaction reference are added before automated reconciliation is considered reliable.

## 5. Required SAK APIs

### `GET /api/v2/Inventory/snapshot`

- Need: Required if POS is the source of truth for available stock, or if the app must periodically correct online stock from POS.
- Consumer: Delivery app catalog/inventory sync, and/or Physalia reconciliation.
- If unavailable: App can only use manually maintained `products.stock`; POS/app disagreement remains unresolved.
- Launch blocker: Needs decision. Blocker if launch requires POS-truth inventory. Not a blocker if app-managed stock is accepted temporarily.
- Minimum fallback: Scheduled/manual CSV stock update or Physalia-provided stock export, plus hide online stock when sync is stale.

### `GET /api/v2/Inventory/changes`

- Need: Required for near-real-time inventory updates after POS sales, receives, adjustments, or returns.
- Consumer: Delivery app inventory sync and Physalia inventory analytics.
- If unavailable: Must poll full snapshots or accept stale online stock between syncs.
- Launch blocker: Not a blocker if snapshot polling is available and stale-stock risk is acceptable.
- Minimum fallback: Poll `Inventory/snapshot` at an agreed cadence and enforce conservative buffers.

### `GET /api/v2/Reports/transactions-detail`

- Need: Required for reconciliation when staff rings online orders in POS or when POS owns final transaction records.
- Consumer: Physalia analytics/reconciliation; possibly delivery app admin reporting if POS transaction ids are backfilled.
- If unavailable: Online orders cannot be reliably matched to POS transactions except by manual order memo/ticket number and totals.
- Launch blocker: Required for reconciliation, not for basic online ordering launch.
- Minimum fallback: Daily POS transaction export from SAK/Forever POS with ticket number, timestamp, line items, tender, tax, discount, and memo/order reference.

### `POST /api/v2/Notifications`

- Need: Required only if SAK/POS should display terminal alerts or an online order notification screen.
- Consumer: Delivery app or Physalia integration service.
- If unavailable: Use current app notifications, Make webhooks, email/ops alerts, and print tickets.
- Launch blocker: Needs decision. Blocker if staff will work from POS terminals only.
- Minimum fallback: Existing app staff board plus Make ops alert plus thermal print ticket.

### `GET /api/v2/Notifications/capabilities`

- Need: Helpful for discovering whether SAK supports terminal bubbles, order-screen notifications, actions, acknowledgement, or deep links.
- Consumer: Delivery app or Physalia integration service during setup/config.
- If unavailable: Capabilities can be documented/configured manually.
- Launch blocker: Not a blocker.
- Minimum fallback: Vendor-provided static documentation and environment-specific configuration.

### POS online order endpoint: `POST` or `PUT`

- Need: Required if online orders must become real POS orders/tickets before staff fulfillment.
- Consumer: Delivery app backend or Physalia integration service.
- If unavailable: Staff must manually create/ring POS transactions from app/print payloads; automated POS ticket lifecycle is not possible.
- Launch blocker: Needs decision. Blocker if real POS order creation is required for launch.
- Minimum fallback: POS notification + printed ticket + manual ringing + reconciliation through transaction reports.

## 6. Online Store to Physalia Reporting Model

The delivery app should report event-style records to Physalia. Existing code does not implement these outbound Physalia events yet.

Recommended events:

- `order_created`: order id, created timestamp, user id, delivery method, payment method, status, total, tax, line items, delivery address/vehicle where appropriate.
- `order_accepted`: order id, previous status, new status, actor id, timestamp.
- `order_rejected`: order id, previous status, `NOT_FULFILLING`, actor id, reason if added later.
- `order_completed`: order id, `DELIVERED` or `PICKED_UP`, actor id, timestamp.
- `order_canceled`: order id, actor id, timestamp, cancellation reason, stock restoration behavior.
- `delivery_assigned`: order id, route/driver id if implemented later; currently no driver assignment entity exists.
- `delivery_completed`: order id, driver actor id if available, timestamp.
- `stockout_attempt`: product id, requested quantity, available app stock, order/cart context.
- `payment_failed`: order id, payment method, gateway status/error, timestamp.
- `refund_or_void`: order id, payment method, order item id if item-level, amount, reason, actor id.
- `order_line_items`: product id, quantity, unit price, line total, voided, added-after-submission, product mapping fields once added.
- `fees_tips_discounts_tax`: tax exists; delivery fees, tips, and order-level discounts were not found in the code and should be reported as zero/null until implemented.
- `pos_reference_attached`: POS transaction id, POS ticket number, terminal id, store id, warehouse id, payment reference.

Recommended payload fields:

- Online order id and order number.
- Current and previous status.
- App user/customer id and safe contact fields needed for operations.
- Delivery method, delivery address snapshot, delivery zone metadata, curbside vehicle info.
- Payment method, Authorize.Net `transactionId` for card orders, store credit transaction references where available.
- Line item ids, app product ids, product names, category names, quantities, unit prices, line totals, void flags.
- POS mapping fields once available: POS product id, SKU, barcode, store id, warehouse id, terminal id, POS ticket/transaction id.

Do not send raw credentials, payment keys, card data, private tokens, or unnecessary customer secrets.

## 7. Reconciliation Model

Desired model:

```text
Online order
  -> POS notification/order
  -> POS transaction
  -> inventory movement
  -> Physalia analytics
```

Current implemented model:

```text
Online cart
  -> Online order
  -> App inventory decrement
  -> App notification / Make webhook / print job
  -> Staff app status transitions
```

Required IDs to connect systems:

| ID | Current availability | Notes |
| --- | --- | --- |
| Online order id | IMPLEMENTED | `Order.id`; also shown as order number. |
| Order number | PARTIAL | UI displays padded `Order.id`; no separate immutable order-number field. |
| POS transaction id | NOT_IMPLEMENTED | Needs new field or mapping table. |
| POS ticket number | NOT_IMPLEMENTED | Needs new field or mapping table. |
| Product id | IMPLEMENTED | App `ProductItem.id`. |
| SKU | NOT_IMPLEMENTED | No SKU field. |
| Barcode | NOT_IMPLEMENTED | No barcode/UPC field. |
| Store id | NOT_IMPLEMENTED | Store settings exist, but no POS store id field. |
| Warehouse id | NOT_IMPLEMENTED | No warehouse model/field. |
| Terminal id | NOT_IMPLEMENTED | No terminal model/field. |
| Payment reference | PARTIAL | Card orders store Authorize.Net `transactionId`; external/in-store do not store POS payment references. Store credit has `CreditTransaction` records. |
| Driver/delivery id | NOT_IMPLEMENTED | No driver assignment or route entity; status updates imply delivery progress. |

Recommended reconciliation records:

- `online_order_pos_link`: online order id, POS ticket id, POS transaction id, store id, terminal id, created/synced timestamps, sync status, last error.
- `product_pos_mapping`: app product id, POS product id, SKU, barcode, POS brand/group/category ids, active flag.
- `payment_pos_mapping`: online order id, app payment method, Authorize.Net transaction id or store-credit transaction id, POS tender id, POS transaction id.
- `inventory_movement_link`: app order id, line item id, app product id, POS movement id, quantity, movement type.

## 8. Launch Blockers

Definite blockers if POS must be source of truth at launch:

- No product SKU/barcode/POS id mapping fields.
- No POS inventory snapshot/change sync.
- No POS order/ticket creation endpoint integration.
- No POS transaction id/ticket number storage.
- No POS payment posting or tender reconciliation.
- No POS acceptance/rejection/status callback path.
- No cancellation/refund/void model that restores stock and updates POS.

Potential blockers even for app-led launch:

- Stock is decremented before staff approval/payment verification for external payments.
- Rejections, item voids, item deletes, and order deletes do not restore stock.
- Driver role backend restriction appears inconsistent with the driver dashboard's `OUT_FOR_DELIVERY -> DELIVERED` workflow.
- No stale inventory policy if POS stock is manually synced.
- No delivery fee, tip, or discount fields if those are required for POS totals.

Not blockers for basic app-led launch:

- POS receipt printing, because the app already has a print queue.
- `Notifications/capabilities`, because capabilities can be configured manually.
- Incremental inventory changes, if full snapshot/manual updates are accepted temporarily.

## 9. Fallback Options

- App-led fulfillment: Use current order board, notifications, and print queue; staff manually rings POS.
- Print-first fallback: Treat printed tickets as the POS handoff artifact until SAK supports online order ingestion.
- Manual reconciliation: Require staff to put online order id in POS memo/ticket notes; reconcile daily against POS transaction report.
- Conservative stock: Keep app-managed stock lower than POS stock to reduce oversell risk.
- Scheduled snapshot sync: Poll a full POS inventory snapshot instead of incremental changes.
- Hide stale inventory: Disable online ordering or hide stock-enabled products when POS sync age exceeds a configured threshold.
- Physalia-owned integration: Let Physalia consume app events and SAK reports, then produce reconciliation tables without embedding all POS logic in the delivery app.

## 10. Open Product Decisions for Jay

- Should online orders become real POS orders, or only POS notifications/tickets for manual ringing?
- Should POS be the source of truth for online inventory availability?
- Should inventory decrement at order creation, staff approval, POS transaction creation, or fulfillment completion?
- Should rejected/canceled/voided orders restore app stock automatically?
- Should POS rejection/cancellation flow back into the delivery app?
- Should staff accept/reject online orders in the app, in POS, or both?
- Should delivery app create POS transactions, or should staff ring POS and Physalia reconcile afterward?
- Should Physalia own cross-system reconciliation, or should the delivery app store POS references directly?
- Should online ordering be disabled when POS inventory sync is stale?
- What product identifier is canonical across Physalia, SAK, Forever POS, and the app: POS product id, SKU, barcode, or app product id?
- Are delivery fees, tips, discounts, and order notes needed for launch POS totals?
- Does SAK support terminal bubble notifications, an online-order screen, acknowledgement, and action callbacks?

## 11. Files Inspected

Backend:

- `backend/src/services/order.service.ts`
- `backend/src/controllers/order.controller.ts`
- `backend/src/routes/order.routes.ts`
- `backend/src/services/product.service.ts`
- `backend/src/controllers/product.controller.ts`
- `backend/src/routes/product.routes.ts`
- `backend/src/services/notificationEvents.service.ts`
- `backend/src/services/notification.service.ts`
- `backend/src/services/notificationDelivery.service.ts`
- `backend/src/services/printJob.service.ts`
- `backend/src/services/thermalPrinter.service.ts`
- `backend/src/services/authorizenet.service.ts`
- `backend/src/services/credit.service.ts`
- `backend/src/routes/printJob.routes.ts`
- `backend/src/controllers/printJob.controller.ts`
- `backend/src/constants/orderMethods.ts`
- `backend/prisma/schema.prisma`
- `backend/.env.example`
- `backend/BACKEND_CONTEXT.md`
- `backend/MAKE_OUTBOUND_NOTIFICATION_FLOW.md`

Frontend:

- `web/src/context/AppContext.jsx`
- `web/src/services/ordersApi.js`
- `web/src/constants/orderStatuses.js`
- `web/src/constants/orderMethods.js`
- `web/src/features/cart/CartPage.jsx`
- `web/src/features/cart/CheckoutPage.jsx`
- `web/src/features/cart/AuthorizeNetPaymentModal.jsx`
- `web/src/features/cart/OrderSuccessPage.jsx`
- `web/src/features/orders/OrdersPage.jsx`
- `web/src/features/orders/OrderDetailPanel.jsx`
- `web/src/features/orders/OrderHistoryPage.jsx`
- `web/src/features/delivery/DeliveryDriverDashboard.jsx`
- `web/src/features/products/csvHelpers.js`
- `web/src/features/products/CsvImportModal.jsx`
- `web/src/features/products/ProductItemPage.jsx`
- `web/src/features/products/ProductItemModal.jsx`
- `web/src/features/products/ProductsGrid.jsx`
- `web/src/features/products/ManageProductsPanel.jsx`

Tests/docs searched:

- `backend/src/services/order.service.test.ts`
- `backend/src/services/order.service.cc-payment.test.ts`
- `backend/src/services/order.service.instore.test.ts`
- `backend/src/integration/order.routes.test.ts`
- `backend/src/integration/printJob.routes.test.ts`
- `backend/src/services/printJob.service.test.ts`
- `backend/src/services/thermalPrinter.service.test.ts`
- `web/src/services/ordersApi.test.js`
- `web/src/App.deliveryEligibility.e2e.test.jsx`
- `web/src/features/products/csvHelpers.test.js`
- `docs/appdocs/*`
- `docs/design-assets/diagrams/*`

Search terms used included: orders, checkout, cart, delivery, inventory, stock, products, notifications, staff, dashboard, print, payment, order status, delivery status, POS, SAK, Physalia, terminal, warehouse, SKU, barcode, transaction, and reconciliation.

## 12. Tests Run or Skipped

No automated tests were run because this task was documentation-only and made no runtime behavior changes.

Validation performed:

- Inspected backend routes, services, controllers, schema, and relevant tests.
- Inspected frontend API clients, cart/checkout pages, staff order board, driver dashboard, notification UI flow, and product import/export helpers.
- Verified the target report path did not previously exist before adding this file.
