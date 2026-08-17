# ForeverPOS API Integration

ForeverPOS is the SAK Retail Solutions POS system. This document covers every API call made during the order workflow — endpoint, method, request body, and an example for each.

All requests go to `{baseUrl}` configured per store in `posConfig.baseUrl`.

---

## Authentication

**Every request requires a Bearer token.** The token is fetched lazily (on the first request per worker batch) and refreshed automatically if a 401 is received.

### `POST /api/Users/login-email`

**When:** Before the first API call in a worker batch, and again on any 401 response.

**Request:**
```json
{
  "email": "pos-user@store.com",
  "password": "secret"
}
```

**Response:**
```json
{
  "accessToken": "eyJhbGci..."
}
```

The token is cached in the `ForeverPosClient` instance and reused for the entire batch. A new batch (next 30s poll cycle) resolves a fresh client from store settings, so the token lives for one batch only — there is no cross-batch persistence.

---

## Order Creation

**Trigger:** An order is moved to `APPROVED` status for the first time (whether by staff or by card payment confirmation). The outbox worker processes the queued `ORDER_CREATED` row.

### `POST /api/Voucher/order`

Creates a new voucher (sale) in ForeverPOS representing the online order. A single catch-all line item carries the full order value — we do not send individual product line items.

**Request:**
```json
{
  "total": 18.50,
  "grandTotal": 20.08,
  "vat": 1.58,
  "discount": 0,
  "cash": 0,
  "credit": 20.08,
  "otherPayment": 0,
  "applyAutomaticPromotions": false,
  "orderType": "online",
  "status": "Processing",
  "note": "Online Order #1042",
  "items": [
    {
      "productId": 99,
      "productVariantId": 201,
      "productName": "Online Order #1042",
      "rate": 20.08,
      "quantity": 1,
      "unitDiscountAmount": 0,
      "subTotal": 20.08,
      "vatAmount": 0,
      "totalVat": 0,
      "total": 20.08
    }
  ]
}
```

**Field notes:**

| Field | Source |
|---|---|
| `total` | `order.subtotal` (pre-tax) |
| `grandTotal` | `order.total` (the amount charged) |
| `vat` | `order.tax` |
| `cash` | Sum of SETTLED payments with method `CASHAPP`, `EXTERNAL`, or `IN_STORE` |
| `credit` | Sum of SETTLED payments with method `CC` |
| `otherPayment` | Sum of SETTLED payments with method `STORE_CREDIT` |
| `status` | Always `"Processing"` at creation (APPROVED maps to Processing) |
| `note` | `"Online Order #<id>"` |
| `items[0].productId` | `posConfig.sakCatchAllProductId` — the generic online order product in ForeverPOS |
| `items[0].productVariantId` | `posConfig.sakCatchAllVariantId` |
| `items[0].rate` / `total` / `subTotal` | All set to `grandTotal` (the full order amount) |

**Payment bucketing — only `SETTLED` payments are counted:**

| Our payment method | ForeverPOS field |
|---|---|
| `CC` | `credit` |
| `STORE_CREDIT` | `otherPayment` |
| `CASHAPP`, `EXTERNAL`, `IN_STORE` (and any unknown method) | `cash` |

**Response:**
```json
{
  "voucherId": 8841
}
```

The `voucherId` is stored in `order_pos_mappings` (`orderId → externalId`) and used for all subsequent status pushes for this order.

---

## Status Updates

**Trigger:** Any status change on an order after it has been created in ForeverPOS. The outbox worker processes `ORDER_UPDATED` rows. If the `ORDER_CREATED` row hasn't been processed yet (race condition at high load), the update is deferred — reset to PENDING without burning a retry — and will process after the create completes.

### `PUT /api/Voucher/bulk-update`

Updates the status field on the ForeverPOS voucher.

**Request:**
```json
{
  "ids": [8841],
  "action": "Update",
  "field": "status",
  "value": "Ready"
}
```

**`ids`** is an array containing the single `voucherId` from `order_pos_mappings`.

**Status mapping — our status → ForeverPOS value:**

| Our status | ForeverPOS `value` | Notes |
|---|---|---|
| `APPROVED` | `Processing` | Initial creation status; unlikely to be sent as an update |
| `READY_FOR_PICKUP` | `Ready` | |
| `ARRIVED` | `Ready` | Curbside arrived — customer is in the parking lot |
| `OUT_FOR_DELIVERY` | `Out for Delivery` | |
| `DELIVERED` | `Delivered` | |
| `CANCELLED` | `Cancelled` | |

Any status **not** in this map (`PENDING`, `READY_FOR_DELIVERY`, etc.) is not pushed to ForeverPOS at all — `shouldPushStatus()` returns false and no outbox row is written.

**Response:** `204 No Content` (no body).

---

## Worker Behavior

The outbox worker runs every 30 seconds. Per cycle:

1. Claims up to 10 PENDING outbox rows atomically (`FOR UPDATE SKIP LOCKED`)
2. Resolves `ForeverPosClient` once for the batch (single login, token reused across all rows)
3. Processes each row sequentially:
   - `ORDER_CREATED` → `POST /api/Voucher/order` → store voucherId
   - `ORDER_UPDATED` → `PUT /api/Voucher/bulk-update`
4. On failure: increments attempt counter, resets to PENDING (max 5 attempts, then FAILED)
5. On crash mid-batch: rows stuck in `PROCESSING` are reclaimed after 5 minutes

---

## Configuration Required Per Store

```json
{
  "posProvider": "foreverpos",
  "posConfig": {
    "baseUrl": "https://<instance>.sakretailsolutions.com",
    "username": "<login email>",
    "password": "<password>",
    "sakCatchAllProductId": 99,
    "sakCatchAllVariantId": 201
  }
}
```

`sakCatchAllProductId` and `sakCatchAllVariantId` must be real IDs from the ForeverPOS account — the generic "Online Order" product set up on the POS side. Everything else follows from there.
