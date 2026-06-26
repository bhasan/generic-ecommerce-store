# ForeverPOS (SAK Retail Solutions) Provider — Outbox-Backed Design

**Date:** 2026-06-26
**Status:** Approved (revised after live API discovery)
**Builds on:** `2026-06-26-pos-integration-design.md` (the provider-agnostic POS layer, already merged)

## Overview

Implement the real ForeverPOS provider against the SAK Retail Solutions API, and upgrade the POS push mechanism from in-process fire-and-forget to a **durable transactional outbox** so order/status sync survives restarts and never silently drifts. Providers stay pure HTTP adapters; all persistence, ordering, idempotency, and retry live in the orchestration layer, preserving POS-agnosticism.

This revision incorporates findings from a live discovery spike against the SAK API (see "Confirmed API Behavior").

## Goals

- Push orders and order-status changes to SAK reliably, with guaranteed eventual delivery
- Keep providers pure (HTTP only, no DB) so new vendors require no orchestration changes
- Prevent duplicate SAK vouchers (idempotency)
- Maintain a product mapping from our catalog to SAK's (required for order creation)
- Provide structured, alertable logs for monitoring

## Non-Goals

- Inbound sync (SAK → app webhooks)
- Backfilling historical orders
- A separate worker process or external queue (Redis/BullMQ) — in-process worker only
- **Payment push** — online-order payment is not supported by the SAK API (see findings); deferred until the vendor confirms a mechanism

## Confirmed API Behavior (from live spike, 2026-06-26)

All verified against `https://api.sakretailsolutions.com` with real credentials.

- **Auth:** `POST /api/Users/login-email` with `{ email, password }` → `{ accessToken, user }`. `accessToken` is a JWT with a **~6-month** lifetime. Send as `Authorization: Bearer <token>`.
- **Create order:** `POST /api/Voucher/order` (body = `VoucherDto`) → **`{ "voucherId": <int> }`** on 200. Use `orderType: "online"`, `status: "Pending"`.
  - **Each line item REQUIRES a valid SAK `productId` AND `productVariantId`** — the API rejects unknown/zero products (`"valid product/variant is required"`). This makes a product mapping mandatory.
  - Omitting `customerId`/`terminalId`/`sessionId` is accepted.
- **List online orders:** `GET /api/Voucher/online-orders` (v1, paged) returns our orders with `voucherId`, `status`, totals. (`GET /api/v2/Voucher?orderType=online` returns a richer envelope; not needed since we push, not pull.)
- **Update status:** `PUT /api/Voucher/bulk-update` with `{ ids: [voucherId], action: "Update", field: "status", value: "<status>" }` → `{ "updated": 1 }`. **Verified** Pending → Processing → Delivered.
  - `action` must be exactly `"Update"` (or `"Delete"`).
  - **`status` is free-text — no server-side validation.** We control the vocabulary; SAK stores whatever we send.
- **Update items/totals:** `PUT /api/Voucher/{id}/update-voucher` (full `VoucherDto`) → `204`. Use only if we need to revise line items/totals, not for status-only changes.
- **Payment (NOT usable for online orders):** `PUT /api/Voucher/{id}/payment` and `PUT /api/Voucher/order/{id}/payment` both return `404 "Voucher not found"` for online orders, before and after status changes. Online orders are a distinct entity from payable vouchers; payment is applied in-store at fulfillment. **Payment push is out of scope for v1.**
- **Online orders are not addressable as `/api/Voucher/{id}`** (returns 404) — they live only in the online-orders collection. The `voucherId` we store is the online-order identifier used by `bulk-update` and `update-voucher`.

### Key DTO shapes (live)

`VoucherDto` (create/update): `total, grandTotal, vat, discount, cash?, credit?, due?, note?, orderType, status, applyAutomaticPromotions, items[]`.
`VoucherCartItem`: `productId, productVariantId, productName, rate, quantity, unitDiscountAmount, subTotal, vatAmount, totalVat, total`. (`productId`/`productVariantId` required and must be valid in SAK.)

## Product Mapping Subsystem (required prerequisite)

Order creation cannot proceed without SAK product/variant IDs per line item. We maintain a mapping from our `ProductVariant` → SAK `(productId, productVariantId)`.

```prisma
model SakProductMapping {
  id              Int      @id @default(autoincrement())
  variantId       Int      @unique           // our ProductVariant.id
  sakProductId    Int
  sakVariantId    Int
  matchedBy       String                      // 'sku' | 'barcode' | 'manual'
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  variant         ProductVariant @relation(fields: [variantId], references: [id], onDelete: Cascade)

  @@map("sak_product_mappings")
}
```

- **Auto-population:** a one-time/maintainable sync matches our variants to SAK's catalog by **SKU** (our `ProductVariant.sku` is `@unique`) and/or **barcode** (SAK variants expose `barcode`). SAK catalog is fetched via `GET /api/Products` + `GET /api/ProductVariants/products/{id}/variants`.
- **Misses:** any variant without a mapping is surfaced for **manual entry** (admin action). An order containing an unmapped variant cannot be pushed.
- **Enforcement at push time:** the SAK provider looks up the mapping for each item; if any item is unmapped, it throws a clear error → the outbox row goes to retry/FAILED with an actionable log (`pos_unmapped_product`).

## Architecture

```
Order created/updated (in DB transaction)
  └── posService.enqueue(orderId, type)        ← writes pos_outbox row in SAME tx
        (no HTTP here — just a durable to-do)

In-process worker loop (every 30s, started in index.ts)
  └── claim PENDING rows (FOR UPDATE SKIP LOCKED, oldest first)
        ├── ORDER_CREATED → provider.pushOrder(ctx) → store mapping(voucherId) → DONE
        └── ORDER_UPDATED → look up voucherId mapping;
              if none yet → leave PENDING (self-orders behind ORDER_CREATED)
              else → provider.pushStatus(ctx) → DONE
```

Two outbox event types in v1: `ORDER_CREATED` and `ORDER_UPDATED`. No `PAYMENT_ADDED`.

### Components

- **`pos_outbox` table** — durable queue, written transactionally with the order.
- **`order_pos_mappings` table** — `(orderId, provider) → externalId` (the SAK `voucherId`). Written by the worker after a successful create. Its presence signals the order reached SAK and gates status updates.
- **`sak_product_mappings` table** — our variant → SAK product/variant IDs (above).
- **`outboxWorker.ts`** — `setInterval` loop (30s, env `POS_OUTBOX_POLL_MS`); claims rows with `FOR UPDATE SKIP LOCKED`; dispatches by type; handles retry/failure transitions. Started from `index.ts`.
- **`posService.ts`** — `enqueue(...)` (transactional) + per-type processing. Owns mapping persistence and idempotency.
- **`foreverpos.provider.ts`** — pure adapter: auth (lazy token, cache, refresh on 401), `pushOrder`, `pushStatus`. Field/status mapping and product-ID lookup live here. No DB writes; reads mappings via an injected lookup function so the provider stays pure-ish (or posService resolves product IDs and passes them in — see Interface).

## Data Model (Prisma)

```prisma
model PosOutbox {
  id          Int       @id @default(autoincrement())
  orderId     Int
  provider    String                       // 'foreverpos'
  type        String                       // 'ORDER_CREATED' | 'ORDER_UPDATED'
  status      String    @default("PENDING")// 'PENDING' | 'DONE' | 'FAILED'
  attempts    Int       @default(0)
  lastError   String?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  order       Order     @relation(fields: [orderId], references: [id], onDelete: Cascade)

  @@index([status, id])
  @@map("pos_outbox")
}

model OrderPosMapping {
  id          Int      @id @default(autoincrement())
  orderId     Int
  provider    String
  externalId  String                        // SAK voucherId
  createdAt   DateTime @default(now())
  order       Order    @relation(fields: [orderId], references: [id], onDelete: Cascade)

  @@unique([orderId, provider])             // lookup key + idempotency guard
  @@map("order_pos_mappings")
}
```

Plus `SakProductMapping` (above). `Order` gains back-relations; `ProductVariant` gains a back-relation to `SakProductMapping`.

## Interface Evolution

```ts
export interface PosContext {
  order: PosOrderPayload;
  externalId?: string | null;   // SAK voucherId, set for status updates
}

export interface PosProvider {
  shouldPushStatus(status: string): boolean;
  pushOrder(ctx: PosContext): Promise<{ externalId: string | null }>;  // returns SAK voucherId
  pushStatus(ctx: PosContext): Promise<void>;                          // requires ctx.externalId
}
```

`pushPayment` is removed from the v1 interface (no SAK support). `pushOrder` returns the voucher ID for the orchestrator to persist. Product-ID resolution: posService loads `sak_product_mappings` for the order's variants and includes them in `PosOrderPayload.items` (each item carries `sakProductId`/`sakVariantId`), keeping the provider free of DB access.

## Status Mapping (our status → SAK string)

Since SAK status is free-text, we define a clean mapping in the provider (refine with the store's preferred labels):

| Our status | SAK `status` value |
|---|---|
| PENDING | `Pending` |
| APPROVED | `Processing` |
| READY_FOR_PICKUP / ARRIVED | `Ready` |
| OUT_FOR_DELIVERY | `Out for Delivery` |
| DELIVERED | `Delivered` |
| CANCELLED | `Cancelled` |

`shouldPushStatus` returns true for the statuses we choose to surface (start with the mapped set above; unmapped statuses are skipped).

## Orchestration Details

### Enqueue (transactional, no HTTP)
`order.service.ts` enqueues **inside** the order's `prisma.$transaction`:
- On create (provider configured): enqueue `ORDER_CREATED`.
- On status change (gated by `shouldPushStatus`): enqueue `ORDER_UPDATED`.
- If `posProvider` is null: enqueue nothing.

### Worker processing
- Claim up to N PENDING rows oldest-first via `SELECT … FOR UPDATE SKIP LOCKED` (raw query) so multiple instances never double-process.
- **ORDER_CREATED:** idempotency guard — if a mapping already exists for `(orderId, provider)`, mark `DONE` without re-pushing. Else resolve product IDs, `pushOrder`, persist `OrderPosMapping(voucherId)`, mark `DONE`.
- **ORDER_UPDATED:** look up the voucherId mapping. If absent → leave `PENDING` (self-orders behind create; don't increment attempts). Else `pushStatus` via `bulk-update`, mark `DONE`.
- **On failure:** increment `attempts`, record `lastError`. At `attempts >= MAX_ATTEMPTS` (5) → `FAILED`. Unmapped-product errors go straight to a clear FAILED state with `pos_unmapped_product`.

### Field mapping (in provider)
`VoucherDto`: `grandTotal` ← total; `total` ← subtotal; `vat` ← tax; `discount` ← (if available); `status` ← mapped status; `orderType` ← `"online"`. Money formatted to fixed-2 decimals. `items[]` ← each with mapped `productId`/`productVariantId`, `productName`, `rate` ← unitPrice, `quantity`, `total` ← unitPrice×quantity; omit unknown fields. Omit `cash`/`credit` (no payment in v1).

## Observability & Alerting

Stable `event` field per log line for exact-match alerting:

| Event | Level | Trigger | Alert |
|---|---|---|---|
| `pos_outbox_enqueued` | info | Row created | — |
| `pos_outbox_success` | info | Push succeeded (type, orderId, voucherId) | — |
| `pos_outbox_retry` | warn | Attempt failed, will retry | rate |
| `pos_outbox_failed` | error | Row hit MAX_ATTEMPTS → FAILED | **YES** |
| `pos_unmapped_product` | error | Order has a variant with no SAK mapping | **YES** |
| `pos_outbox_backlog_high` | warn | Periodic check: PENDING count > threshold | **YES** |
| `pos_auth_failed` | error | SAK login/token rejected | **YES** |
| `pos_worker_crashed` | error | Worker loop threw unexpectedly | **YES** |

- Worker wraps each loop iteration in try/catch → `pos_worker_crashed`; loop never dies permanently.
- Periodic backlog gauge counts PENDING rows, emits `pos_outbox_backlog_high` past a configurable threshold.
- `FAILED` rows are recoverable: reset `status` to `PENDING` to replay (admin action/manual SQL acceptable for v1).

## Security

- SAK credentials live only in encrypted `posConfig` (AES-256-GCM via `crypto.util`) or env — never committed.
- The credential used during the spike (`junaid.syed61@gmail.com`, weak password) must be **rotated** before production; treat the transcript value as compromised.

## Implementation Sequence

1. Prisma migration: `pos_outbox`, `order_pos_mappings`, `sak_product_mappings`, back-relations.
2. Product-mapping sync: fetch SAK catalog, match our variants by SKU/barcode, persist mappings, surface misses.
3. `PosContext` interface change (`pushStatus` replaces `pushPayment`); update pure-provider + posService signatures; items carry SAK IDs.
4. `posService` enqueue + per-type processing + idempotency + mapping persistence + product-ID resolution.
5. `outboxWorker.ts` with `FOR UPDATE SKIP LOCKED`; start in `index.ts`.
6. Real `foreverpos.provider.ts`: auth (`/api/Users/login-email`), `pushOrder` (`POST /api/Voucher/order`), `pushStatus` (`PUT /api/Voucher/bulk-update`), field/status mapping.
7. Replace detached calls in `order.service.ts` with transactional enqueues.
8. Structured logging events throughout.
9. Tests (below).

## Testing

- **Unit:** posService enqueue writes a row in-tx; worker processes each type; ORDER_UPDATED defers without a voucher mapping; idempotency guard skips duplicate create; failure increments attempts → FAILED at cap; unmapped product → FAILED + `pos_unmapped_product`.
- **Provider (HTTP mocked):** auth token fetch + refresh on 401; `pushOrder` posts correct VoucherDto and returns voucherId; `pushStatus` sends correct `bulk-update` body; status mapping correctness; field/money formatting.
- **Product mapping:** SKU/barcode match logic; miss handling.
- **Worker claim:** `FOR UPDATE SKIP LOCKED` returns oldest PENDING; concurrent claim does not double-process.
- **Live integration:** manual, against SAK, mirroring the verified spike flow (create → list → bulk-update status).

## Open Vendor Question (non-blocking for v1)

Confirm with SAK whether online-order **payment** is ever meant to flow through the API (the documented payment endpoints 404 for online orders). If yes, add a `PAYMENT_ADDED` outbox type later — the architecture already supports it.

## Future Considerations

- Graduating to a separate worker process or BullMQ is a deploy change, not a rewrite — the queue is the DB.
- Per-row backoff scheduling (`nextAttemptAt`) if SAK outages cause hot-looping.
- Admin UI to view/replay `FAILED` rows and manage product-mapping misses.
