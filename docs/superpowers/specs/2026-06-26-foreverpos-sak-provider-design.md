# ForeverPOS (SAK Retail Solutions) Provider — Outbox-Backed Design

**Date:** 2026-06-26
**Status:** Approved (revised after live API discovery + product decisions)
**Builds on:** `2026-06-26-pos-integration-design.md` (the provider-agnostic POS layer, already merged)

## Overview

Implement the real ForeverPOS provider against the SAK Retail Solutions API, and upgrade the POS push from in-process fire-and-forget to a **durable transactional outbox** so order/status sync survives restarts and never silently drifts. Providers stay pure HTTP adapters; all persistence, ordering, idempotency, and retry live in the orchestration layer, preserving POS-agnosticism.

This revision incorporates a live discovery spike against the SAK API and three decisions:
- **Single catch-all line item** — no per-product mapping; one generic "Online Order" product carries the grand total.
- **Push on payment settled (APPROVED)** — the SAK voucher is created when our order is approved, with payment populated, because SAK only accepts payment at creation.
- **Capability-based module structure** — the `pos/` module is organized by capability (order sync now; inventory sync later) with a shared per-vendor client, so future ForeverPOS integrations slot in without a god-interface or duplicated auth. Only order sync is built now; inventory is a seam, not code.

## Goals

- Push orders (with payment) and subsequent status changes to SAK reliably, with guaranteed eventual delivery
- Keep providers pure (HTTP only, no DB) so new vendors require no orchestration changes
- Prevent duplicate SAK vouchers (idempotency)
- Provide structured, alertable logs for monitoring

## Non-Goals

- Inbound sync (SAK → app webhooks)
- Backfilling historical orders
- Per-product line items / inventory sync in SAK (deliberately using a catch-all line — see decisions)
- Returns / refunds sync (handled entirely on the POS side)
- A separate worker process or external queue (Redis/BullMQ) — in-process worker only

## Confirmed API Behavior (from live spike, 2026-06-26)

All verified against `https://api.sakretailsolutions.com` with real credentials.

- **Auth:** `POST /api/Users/login-email` with `{ email, password }` → `{ accessToken, user }`. JWT, **~6-month** lifetime. Send as `Authorization: Bearer <token>`.
- **Create order:** `POST /api/Voucher/order` (body = `VoucherDto`) → **`{ "voucherId": <int> }`** on 200. Use `orderType: "online"`.
  - **`items` is required** and each line needs a **valid SAK `productId` + `productVariantId`**. A **single catch-all line** referencing one generic SAK product is accepted (verified): `productName` free-text, `rate`/`total` = order grand total, `quantity` = 1.
  - **Payment is recorded only here, at creation**, via `cash` / `credit` (and `otherPayment`, `zilla`) fields. Verified: `cash: 6` → `cashUSD: 6.0`, settled. Omitting `customerId`/`terminalId`/`sessionId` is accepted.
- **Update status:** `PUT /api/Voucher/bulk-update` with `{ ids: [voucherId], action: "Update", field: "status", value: "<status>" }` → `{ "updated": 1 }`. Verified Pending→Processing→Delivered.
  - `action` must be exactly `"Update"` (or `"Delete"`). **Only the `status` field is supported** — `field: "cash"` returns `"Unsupported field"`. **Payment cannot be changed after creation by any endpoint.**
  - **`status` is free-text — no validation.** We control the vocabulary.
- **List online orders:** `GET /api/Voucher/online-orders` (v1, paged) — for debugging/verification only (we push, not pull).
- **Online orders are not addressable as `/api/Voucher/{id}`** and **payment endpoints (`/payment`) 404 for online orders.** The stored `voucherId` is the online-order identifier used by `bulk-update`.

### Key DTO shapes (live)

`VoucherDto`: `total, grandTotal, vat, discount, cash?, credit?, otherPayment?, zilla?, due?, note?, orderType, status, applyAutomaticPromotions, items[]`.
`VoucherCartItem`: `productId, productVariantId, productName, rate, quantity, unitDiscountAmount, subTotal, vatAmount, totalVat, total`.

## Product Decisions (drive the design)

**1. Catch-all line item.** A single dedicated "Online Order" product is created once in SAK; its `productId` + `productVariantId` are stored in `posConfig` (`sakCatchAllProductId`, `sakCatchAllVariantId`). Every pushed order sends exactly one line item using those IDs, `productName` = e.g. `"Online Order #<ourOrderId>"`, `rate`/`subTotal`/`total` = grand total, `quantity` = 1. SAK captures order + total + payment for accounting; per-product inventory/reporting in SAK is intentionally out of scope.

**2. Push on payment settled (APPROVED).** Because SAK only accepts payment at creation, the SAK voucher is **created when our order transitions to APPROVED** (EXTERNAL payment becomes SETTLED; CC already paid). The create payload carries `cash`/`credit`. Our brief PENDING window is not mirrored to SAK. Later status changes (e.g. DELIVERED) push via `bulk-update`.

## Architecture

```
Order status → APPROVED (in DB transaction)
  └── posService.enqueue(orderId, 'ORDER_CREATED')   ← pos_outbox row in SAME tx
Order status → later change (DELIVERED, etc.)
  └── posService.enqueue(orderId, 'ORDER_UPDATED')

In-process worker loop (every 30s, env POS_OUTBOX_POLL_MS, started in index.ts)
  └── claim PENDING rows (FOR UPDATE SKIP LOCKED, oldest first)
        ├── ORDER_CREATED → provider.pushOrder(ctx)  (catch-all line + cash/credit)
        │                    → store mapping(voucherId) → DONE
        └── ORDER_UPDATED → look up voucherId mapping;
              if none yet → leave PENDING (self-orders behind ORDER_CREATED)
              else → provider.pushStatus(ctx) (bulk-update) → DONE
```

### Module Structure (capability-based)

The `pos/` module is organized by **capability**, not by one monolithic provider, so future ForeverPOS work (inventory sync, etc.) slots in without bloating an order-shaped interface or duplicating auth. This is a refactor of the currently-merged flat layout (`PosProvider.ts`, `providers/foreverpos.provider.ts`, etc.).

```
pos/
  client/                       # shared per-vendor connection concerns (future-extensible)
  orders/                       # ORDER-SYNC capability
    PosOrderSync.ts             # interface (renamed from PosProvider) + PosContext/payload types
    posOrderService.ts          # enqueue + per-type processing (renamed from posService.ts)
    outboxWorker.ts             # 30s setInterval, FOR UPDATE SKIP LOCKED, dispatch by type
    retry.ts                    # shared retry (moved here for now; promote to shared if reused)
  providers/
    foreverpos/
      client.ts                 # ForeverPosClient: auth (lazy token, cache, refresh on 401) + HTTP. SHARED across capabilities.
      orders.ts                 # implements PosOrderSync (pushOrder, pushStatus); field/status/payment mapping. Uses client. No DB.
      # inventory.ts            # (FUTURE) implements PosInventorySync — not built now
  registry.ts                   # maps providerKey → { orderSync?: PosOrderSync; inventorySync?: ... }
```

- **`ForeverPosClient`** is the only piece shared between capabilities: auth token lifecycle + raw SAK HTTP. Order sync consumes it now; inventory sync will reuse it later.
- **`PosOrderSync`** (renamed from `PosProvider`) is the order capability only. A vendor implements the capabilities it supports; the registry resolves **per capability** (`getOrderSync(settings)`), returning `null` if unsupported/unconfigured.
- **Inventory is NOT built now** — only the seam exists (the registry's capability map and the `providers/foreverpos/` directory). Inventory sync will be scheduled/inbound/idempotent (a poller, not an outbox) — deliberately separate machinery.

### Persistence & workers

- **`pos_outbox`** — durable queue, written transactionally with the status change.
- **`order_pos_mappings`** — `(orderId, provider) → externalId` (SAK `voucherId`). Written by the worker after a successful create; gates status updates.
- **`outboxWorker.ts`** — 30s `setInterval`; claims with `FOR UPDATE SKIP LOCKED`; dispatches by type; retry/failure transitions. Started in `index.ts`.
- **`posOrderService.ts`** — `enqueue(...)` (transactional) + per-type processing; owns mapping persistence + idempotency; resolves the order-sync capability from the registry.

## Data Model (Prisma)

```prisma
model PosOutbox {
  id        Int      @id @default(autoincrement())
  orderId   Int
  provider  String                          // 'foreverpos'
  type      String                          // 'ORDER_CREATED' | 'ORDER_UPDATED'
  status    String   @default("PENDING")    // 'PENDING' | 'DONE' | 'FAILED'
  attempts  Int      @default(0)
  lastError String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  order     Order    @relation(fields: [orderId], references: [id], onDelete: Cascade)

  @@index([status, id])
  @@map("pos_outbox")
}

model OrderPosMapping {
  id         Int      @id @default(autoincrement())
  orderId    Int
  provider   String
  externalId String                          // SAK voucherId
  createdAt  DateTime @default(now())
  order      Order    @relation(fields: [orderId], references: [id], onDelete: Cascade)

  @@unique([orderId, provider])               // lookup key + idempotency guard
  @@map("order_pos_mappings")
}
```

`Order` gains back-relations `posOutbox PosOutbox[]` and `posMappings OrderPosMapping[]`. **No product-mapping table.**

## posConfig additions

```ts
posConfig: {
  baseUrl?: string;              // https://api.sakretailsolutions.com
  username?: string;             // SAK login email (encrypted)
  password?: string;             // SAK login password (encrypted)
  sakCatchAllProductId?: number; // the generic "Online Order" product
  sakCatchAllVariantId?: number;
}
```

## Interface Evolution

The order capability interface, renamed from `PosProvider` to **`PosOrderSync`** (lives in `pos/orders/PosOrderSync.ts`):

```ts
export interface PosContext {
  order: PosOrderPayload;        // includes status, grandTotal, payments[]
  externalId?: string | null;    // SAK voucherId, set for status updates
}

export interface PosOrderSync {
  shouldPushStatus(status: string): boolean;
  pushOrder(ctx: PosContext): Promise<{ externalId: string | null }>;  // returns SAK voucherId
  pushStatus(ctx: PosContext): Promise<void>;                          // requires ctx.externalId
}
```

`pushPayment` is removed; payment is folded into `pushOrder`'s create payload. Future capabilities (e.g. `PosInventorySync`) are **separate interfaces**, not additions to this one.

The registry resolves capabilities independently:

```ts
// registry.ts
export function getOrderSync(settings: StoreSettings): PosOrderSync | null;
// future: export function getInventorySync(settings): PosInventorySync | null;
```

## Status & Payment Mapping (in provider)

**Status** (our status → SAK free-text; refine with the store's labels):

| Our status | SAK `status` |
|---|---|
| APPROVED | `Processing` |
| READY_FOR_PICKUP / ARRIVED | `Ready` |
| OUT_FOR_DELIVERY | `Out for Delivery` |
| DELIVERED | `Delivered` |
| CANCELLED | `Cancelled` |

The create payload sets `status` from the order's status at push time (normally `Processing` for APPROVED).

**Payment** (our payment → SAK fields). SAK's `credit` = **credit card** (not store credit):

| Our payment method | SAK field |
|---|---|
| CC | `credit` (card) |
| CASHAPP / EXTERNAL | `cash` |
| STORE_CREDIT | `otherPayment` |
| IN_STORE | `cash` |

Sum settled payments into the mapped buckets; send the order grand total split accordingly. Money formatted to fixed-2 decimals.

## Orchestration Details

### Enqueue (transactional, no HTTP)
`order.service.ts` enqueues **inside** the status-change `prisma.$transaction`:
- On transition to **APPROVED** (provider configured): enqueue `ORDER_CREATED`.
- On later status change passing `shouldPushStatus`: enqueue `ORDER_UPDATED`.
- If `posProvider` is null: enqueue nothing.

### Worker processing
- Claim PENDING rows oldest-first via `SELECT … FOR UPDATE SKIP LOCKED` (raw query) — multi-instance safe.
- **ORDER_CREATED:** idempotency guard — if a mapping exists for `(orderId, provider)`, mark `DONE` without re-pushing. Else `pushOrder` (catch-all line + cash/credit + mapped status), persist `OrderPosMapping(voucherId)`, mark `DONE`.
- **ORDER_UPDATED:** look up voucherId. If absent → leave `PENDING` (self-orders behind create; don't increment attempts). Else `pushStatus` (bulk-update), mark `DONE`.
- **On failure:** increment `attempts`, record `lastError`; at `attempts >= MAX_ATTEMPTS` (5) → `FAILED`.

## Observability & Alerting

Stable `event` field per log line for exact-match alerting:

| Event | Level | Trigger | Alert |
|---|---|---|---|
| `pos_outbox_enqueued` | info | Row created | — |
| `pos_outbox_success` | info | Push succeeded (type, orderId, voucherId) | — |
| `pos_outbox_retry` | warn | Attempt failed, will retry | rate |
| `pos_outbox_failed` | error | Row hit MAX_ATTEMPTS → FAILED | **YES** |
| `pos_outbox_backlog_high` | warn | Periodic PENDING count > threshold | **YES** |
| `pos_auth_failed` | error | SAK login/token rejected | **YES** |
| `pos_worker_crashed` | error | Worker loop threw unexpectedly | **YES** |

- Worker wraps each loop iteration in try/catch → `pos_worker_crashed`; the loop never dies permanently.
- Periodic backlog gauge emits `pos_outbox_backlog_high` past a configurable threshold.
- `FAILED` rows are recoverable: reset `status` to `PENDING` to replay (admin action/manual SQL acceptable for v1).

## Security

- SAK credentials live only in encrypted `posConfig` (AES-256-GCM via `crypto.util`) or env — never committed.
- The credential used during the spike (`junaid.syed61@gmail.com`, weak password) must be **rotated** before production; treat the transcript value as compromised.

## Implementation Sequence

1. **Restructure** the merged `pos/` module to the capability layout: create `pos/orders/`, rename `PosProvider` → `PosOrderSync` (`pos/orders/PosOrderSync.ts`), rename `posService.ts` → `pos/orders/posOrderService.ts`, move `retry.ts` under `orders/`, and update `registry.ts` to `getOrderSync(settings)` returning a capability (capability map shape). Move tests alongside.
2. Prisma migration: `pos_outbox`, `order_pos_mappings`, `Order` back-relations.
3. `posConfig` additions (`sakCatchAllProductId`, `sakCatchAllVariantId`); the generic "Online Order" product is created once in SAK and its IDs configured per store.
4. `PosContext` interface (`pushStatus` replaces `pushPayment`) on `PosOrderSync`.
5. Extract **`providers/foreverpos/client.ts`** (`ForeverPosClient`: auth via `/api/Users/login-email`, token cache, refresh on 401, raw HTTP).
6. **`providers/foreverpos/orders.ts`** implements `PosOrderSync`: `pushOrder` (`POST /api/Voucher/order`, catch-all line + payment), `pushStatus` (`PUT /api/Voucher/bulk-update`), status/payment mapping. Uses the client.
7. `posOrderService` enqueue + per-type processing + idempotency + mapping persistence.
8. `outboxWorker.ts` with `FOR UPDATE SKIP LOCKED`; start in `index.ts`.
9. Wire enqueues into the APPROVED transition (and later status changes) in `order.service.ts`; remove the old detached calls.
10. Structured logging events throughout.
11. Tests (below).

## Testing

- **Unit:** enqueue writes a row in-tx on APPROVED; worker processes each type; ORDER_UPDATED defers without a voucher mapping; idempotency guard skips duplicate create; failure increments attempts → FAILED at cap.
- **Provider (HTTP mocked):** auth token fetch + refresh on 401; `pushOrder` posts a VoucherDto with one catch-all line + correct cash/credit + mapped status, returns voucherId; `pushStatus` sends correct `bulk-update` body; status/payment mapping + money formatting.
- **Worker claim:** `FOR UPDATE SKIP LOCKED` returns oldest PENDING; concurrent claim does not double-process.
- **Live integration:** manual, against SAK, mirroring the verified spike flow (create with payment → bulk-update status).

## Returns / Refunds

Out of scope. Returns and refunds are handled entirely on the POS side and are **not** synced from our app.

## Future Considerations

- Per-product line items + inventory sync if the store later wants product-level detail in SAK (would reintroduce a product-mapping subsystem).
- Graduating to a separate worker process or BullMQ — a deploy change, not a rewrite.
- Admin UI to view/replay `FAILED` outbox rows.
