# ForeverPOS (SAK Retail Solutions) Provider — Outbox-Backed Design

**Date:** 2026-06-26
**Status:** Approved
**Builds on:** `2026-06-26-pos-integration-design.md` (the provider-agnostic POS layer, already merged)

## Overview

Implement the real ForeverPOS provider against the SAK Retail Solutions API, and upgrade the POS push mechanism from in-process fire-and-forget to a **durable transactional outbox** so order/payment sync survives restarts and never silently drifts. The design keeps providers as pure HTTP adapters; all persistence, ordering, idempotency, and retry live in the orchestration layer, preserving POS-agnosticism.

## Goals

- Push orders and payments to SAK reliably, with guaranteed eventual delivery
- Keep providers pure (HTTP only, no DB) so new vendors require no orchestration changes
- Guarantee order-then-payment ordering and prevent duplicate SAK vouchers
- Provide structured, alertable logs for monitoring

## Non-Goals

- Inbound sync (SAK → app webhooks)
- Backfilling historical orders
- A separate worker process or external queue (Redis/BullMQ) — in-process worker only
- Confirming SAK's exact auth endpoint (a discovery spike precedes implementation)

## API Reference (SAK / ForeverPOS)

- **Base URL:** `https://api.sakretailsolutions.com` (stored in `posConfig.baseUrl`)
- **Auth:** `POST` with `{ email, password }` → returns a token. **Exact path TBD — discovery spike required** (likely `/api/Account/login` or similar). Credentials live encrypted in `posConfig` (`username` = email, `password`).
- **Create order:** `POST /api/Voucher/order` with order + items payload → returns voucher ID
- **Add payment:** `PUT /api/Voucher/{voucherId}/payment` with payment payload
- **Update behavior:** TBD — verify during spike whether re-`POST`/`PUT` updates an existing voucher or creates a duplicate

## Architecture

```
Order created/updated (in DB transaction)
  └── posService.enqueue(orderId, type)        ← writes pos_outbox row in SAME tx
        (no HTTP here — just a durable to-do)

In-process worker loop (every 5s, started in index.ts)
  └── claim PENDING rows (FOR UPDATE SKIP LOCKED, oldest first)
        ├── ORDER_CREATED → provider.pushOrder(ctx) → store mapping → DONE
        ├── PAYMENT_ADDED → look up mapping;
        │     if none yet → leave PENDING (self-orders behind ORDER_CREATED)
        │     else → provider.pushPayment(ctx) → DONE
        └── ORDER_UPDATED → provider.pushOrder(ctx) (re-push) → DONE
```

### Components

- **`pos_outbox` table** — the durable queue. Written transactionally with the order.
- **`order_pos_mappings` table** — `(orderId, provider) → externalId`. Written by the worker after a successful order push. Its presence is the signal that the order reached SAK.
- **`outboxWorker.ts`** — `setInterval` loop; claims rows with `FOR UPDATE SKIP LOCKED`; dispatches by type; handles retry/failure transitions. Started from `index.ts`.
- **`posService.ts`** — `enqueue(...)` (transactional), plus the per-type processing functions the worker calls. Owns mapping persistence and idempotency.
- **`foreverpos.provider.ts`** — pure adapter: auth (lazy token, cache, refresh on 401), `pushOrder`, `pushPayment`. Field/status mapping lives here. No DB access.

## Data Model (Prisma)

```prisma
model PosOutbox {
  id          Int       @id @default(autoincrement())
  orderId     Int
  provider    String                       // 'foreverpos'
  type        String                       // 'ORDER_CREATED' | 'PAYMENT_ADDED' | 'ORDER_UPDATED'
  status      String    @default("PENDING")// 'PENDING' | 'DONE' | 'FAILED'
  attempts    Int       @default(0)
  lastError   String?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  order       Order     @relation(fields: [orderId], references: [id], onDelete: Cascade)

  @@index([status, id])                     // worker claim query
  @@map("pos_outbox")
}

model OrderPosMapping {
  id          Int      @id @default(autoincrement())
  orderId     Int
  provider    String
  externalId  String                        // SAK voucher ID
  createdAt   DateTime @default(now())
  order       Order    @relation(fields: [orderId], references: [id], onDelete: Cascade)

  @@unique([orderId, provider])             // lookup key + idempotency guard
  @@map("order_pos_mappings")
}
```

`Order` gains back-relations: `posOutbox PosOutbox[]` and `posMappings OrderPosMapping[]`.

## Interface Evolution

```ts
export interface PosContext {
  order: PosOrderPayload;
  externalId?: string | null;   // set for payment/update when mapping exists
}

export interface PosProvider {
  shouldPushStatus(status: string): boolean;
  pushOrder(ctx: PosContext): Promise<{ externalId: string | null }>;
  pushPayment(ctx: PosContext): Promise<void>;
}
```

`pushOrder` returns the external ID so the orchestrator can persist the mapping. `pushPayment` reads `ctx.externalId`. A combined provider implements `pushOrder` to send everything and returns its ID; `pushPayment` becomes a no-op.

## Orchestration Details

### Enqueue (transactional, no HTTP)
`order.service.ts` replaces the detached `void posService.push…()` calls with transactional enqueues, written **inside** the same `prisma.$transaction` that creates/updates the order:
- On create (when provider configured): enqueue `ORDER_CREATED` then `PAYMENT_ADDED`
- On status update (gated by `shouldPushStatus`): enqueue `ORDER_UPDATED`

If `posProvider` is null, enqueue nothing.

### Worker processing
- Claim up to N PENDING rows oldest-first with `SELECT … FOR UPDATE SKIP LOCKED` (raw query via Prisma) so multiple instances never double-process.
- **ORDER_CREATED:** idempotency guard — if a mapping already exists for `(orderId, provider)`, skip the push and mark `DONE`. Else `pushOrder`, persist mapping, mark `DONE`.
- **PAYMENT_ADDED:** look up mapping. If absent → leave `PENDING` (do not increment attempts) so it self-orders behind the order push. If present → `pushPayment(ctx with externalId)`, mark `DONE`.
- **ORDER_UPDATED:** look up mapping; if absent → leave `PENDING`. Else `pushOrder` (re-push), mark `DONE`.
- **On failure:** increment `attempts`, record `lastError`. If `attempts >= MAX_ATTEMPTS` (5) → `FAILED`. Else leave `PENDING` for next loop (backoff via `updatedAt` skew is optional for v1).

### Field mapping (in provider, best-effort)
Map our payload → SAK payload. **Omit keys we don't have** (do not send `0`) and verify during the spike whether SAK rejects their absence:
- `grandTotal` ← order.total; `total` ← order.subtotal; `vat` ← order.tax; `discount` ← (if available)
- `cash` / `credit` ← bucketed from payment method (provider-specific mapping)
- `status` ← mapped from our status vocabulary to SAK's
- `items[]` ← map productName, quantity, `rate` ← unitPrice, `total` ← unitPrice×quantity; omit unknown IDs (`productId`, `wareHouseId`, etc.)
- Money fields formatted to fixed-2 decimals (avoid float artifacts like `19.989999`)

## Observability & Alerting

Every log line carries a stable `event` field for exact-match alerting:

| Event | Level | Trigger | Alert |
|---|---|---|---|
| `pos_outbox_enqueued` | info | Row created | — |
| `pos_outbox_success` | info | Push succeeded (carries type, orderId, externalId) | — |
| `pos_outbox_retry` | warn | Attempt failed, will retry (carries attempts, error) | rate |
| `pos_outbox_failed` | error | Row hit MAX_ATTEMPTS → `FAILED` | **YES** |
| `pos_outbox_backlog_high` | warn | Periodic check: PENDING count > threshold | **YES** |
| `pos_auth_failed` | error | SAK login/token rejected | **YES** |
| `pos_worker_crashed` | error | Worker loop threw unexpectedly | **YES** |

- The worker wraps each loop iteration in try/catch → `pos_worker_crashed`; the loop never dies permanently.
- A periodic backlog gauge (e.g. every N loops) counts PENDING rows and emits `pos_outbox_backlog_high` past a configurable threshold.
- `FAILED` rows are recoverable: resetting `status` to `PENDING` replays them (a small admin action/endpoint can do this; manual SQL is acceptable for v1).

## Security

- SAK credentials live only in encrypted `posConfig` (reusing the AES-256-GCM `crypto.util` path) or env — never committed.
- The credential shared during design (`junaid.syed61@gmail.com` / weak password) must be **rotated** before production; treat the transcript value as compromised.

## Implementation Sequence

1. **Discovery spike** (manual/curl, not committed): confirm auth endpoint + token shape; confirm whether `POST /order` re-push updates vs. duplicates; confirm which fields are required vs. omittable.
2. Prisma migration: `pos_outbox`, `order_pos_mappings`, `Order` back-relations.
3. `PosContext` interface change; update existing pure-provider + posService signatures.
4. `posService` enqueue + per-type processing + idempotency + mapping persistence.
5. `outboxWorker.ts` with `FOR UPDATE SKIP LOCKED`; start in `index.ts`.
6. Real `foreverpos.provider.ts`: auth, pushOrder, pushPayment, field/status mapping.
7. Replace detached calls in `order.service.ts` with transactional enqueues.
8. Structured logging events throughout.
9. Tests: outbox transitions, self-ordering of payment rows, idempotency guard, worker claim logic, provider field mapping (HTTP mocked), auth refresh on 401.

## Testing

- **Unit:** posService enqueue writes a row in-tx; worker processes each type; payment row defers without a mapping; idempotency guard skips duplicate order push; failure increments attempts and transitions to FAILED at the cap.
- **Provider:** field/status mapping correctness; auth token fetch + refresh on 401 (HTTP mocked via `vi.fn`/fetch mock).
- **Worker claim:** `FOR UPDATE SKIP LOCKED` query returns oldest PENDING rows; concurrent claim does not double-process (can be asserted at the query level).
- **Live integration:** manual, post-spike, against the real SAK sandbox.

## Future Considerations

- Graduating to a separate worker process or BullMQ is a deploy change, not a rewrite — worker logic is unchanged because the queue is the DB.
- Per-row backoff scheduling (`nextAttemptAt`) can be added if SAK outages cause hot-looping.
- An admin UI to view/replay `FAILED` rows.
