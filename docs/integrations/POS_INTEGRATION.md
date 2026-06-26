# POS Integration — Technical Rundown

## What this is, in general

This is a **provider-agnostic POS integration layer**. Its job is to keep an external point-of-sale system in sync with our app — pushing online orders, payments, and status changes out to whatever POS a store is configured to use. The design deliberately separates *what* we sync (orders now, inventory later) from *which vendor* we sync to, so adding a new POS vendor or a new sync capability doesn't mean rewriting the plumbing.

**Currently we have one provider implemented: ForeverPOS** (SAK Retail Solutions). Everything below describes the general machinery and then how the ForeverPOS provider plugs into it. A second vendor would implement the same interfaces; a second capability (e.g. inventory) would reuse the same shared transport.

## What it does

1. **Structure for implementing POS integrations** — a provider-agnostic framework where new vendors and new sync capabilities plug in without reworking the plumbing. *(ForeverPOS is the one provider implemented today.)*

2. **Pushes order + status CRUD** from the online store to the POS — online orders and their subsequent status changes flow out to the POS, with payment recorded for accounting. Backend workers push pending order and payment updates durably: changes are queued transactionally and drained by the worker with retries, so nothing is lost on outages or restarts.

3. **Inventory CRUD** *(planned, not yet implemented)* — syncing stock/product data with the POS. The architecture reserves a seam for this so it reuses the same vendor transport layer.

## Why it's designed this way

The naive approach — "call the POS API right after we save the order" — fails silently. If the POS is down, the network blips, or our process restarts mid-call, the order never reaches the POS and nobody knows. For a system of record like accounting, that drift is unacceptable.

So we use the **transactional outbox pattern**: instead of calling the POS directly, we write an outbox row in the *same database transaction* as the order change. A background worker drains that outbox and does the actual API calls, with retries. Either both the order change and the outbox row commit, or neither does — there's no window where an order exists without a pending POS push.

## How it flows

```
Order hits APPROVED (in a DB transaction)
   └─ write pos_outbox row (ORDER_CREATED)   ← same transaction as the status write
Order hits a later status (DELIVERED, etc.)
   └─ write pos_outbox row (ORDER_UPDATED)

Background worker (every 30s)
   ├─ claim a batch of PENDING rows (atomically, multi-instance safe)
   ├─ ORDER_CREATED → create the POS voucher, save orderId→voucherId mapping
   └─ ORDER_UPDATED → look up the voucherId, push the new status
```

Two key business rules baked in (ForeverPOS-specific):

- **We push on APPROVED, not on order creation.** ForeverPOS only accepts payment at voucher-creation time, and our non-card payments only settle at approval. So we wait until payment is known, then create the POS voucher with payment attached.
- **One catch-all line item.** Each order becomes a single generic "Online Order" line carrying the grand total — we're giving the POS the order + money for accounting, not per-product inventory detail (that's deliberately out of scope for now).

## Architecture (the part that matters for extensibility)

The module is organized **by capability**, not as one monolithic "POS provider" class:

```
pos/
  orders/                    ← the order-sync capability (vendor-agnostic)
    PosOrderSync.ts          ← the interface + payload types every provider implements
    posOrderService.ts       ← enqueue + process one outbox row
    outboxWorker.ts          ← the 30s drain loop
  providers/
    foreverpos/              ← the one provider implemented today
      client.ts              ← SHARED transport: auth + HTTP (every capability reuses this)
      orders.ts              ← ForeverPOS's implementation of PosOrderSync
  registry.ts                ← resolves "which provider/capability is configured" from store settings
```

Two dividing lines make this extensible:

- **Vendor-agnostic core vs. provider adapter.** `orders/` knows nothing about ForeverPOS — it speaks the `PosOrderSync` interface. A new vendor adds a `providers/<vendor>/orders.ts` and registers it; the outbox, worker, and orchestration are untouched.
- **Transport vs. capability.** `client.ts` is transport (login, token caching, refresh-on-401, raw HTTP). `orders.ts` is the order capability (status mapping, payment bucketing, request shaping). When inventory sync comes, it's a new `inventory.ts` reusing the same `client.ts` — auth isn't rewritten. Config types are split the same way (`ForeverPosConfig` = transport creds; `ForeverPosOrderConfig` = order-specific settings) so the transport type never becomes a junk drawer.

## Reliability details worth knowing

- **Multi-instance safe.** The worker claims rows with `SELECT … FOR UPDATE SKIP LOCKED` inside a short transaction, marking them `PROCESSING` before any HTTP. Two app instances never process the same row, and no DB connection is held open during network calls.
- **Crash-safe.** If the worker dies mid-batch, rows stuck in `PROCESSING` are reclaimed after a lease timeout (5 min default) — they can't be orphaned.
- **Ordering guarantee.** An `ORDER_UPDATED` that arrives before its `ORDER_CREATED` finished "defers" (throws a typed `DeferralError`) — the worker leaves it `PENDING` without burning a retry, so status updates naturally queue behind the create.
- **Retry + giving up.** Failures increment an attempt counter; after 5 attempts a row goes `FAILED` (recoverable by resetting it to `PENDING`).
- **Idempotent creates.** Before creating a POS voucher we check for an existing mapping, so a replayed row never double-creates.

## Observability

Every meaningful event logs a stable `event` field for exact-match alerting. The ones to wire alerts on:

| Event | Meaning |
|---|---|
| `pos_outbox_failed` | A row gave up after max retries — **needs attention** |
| `pos_auth_failed` | POS login/credentials rejected |
| `pos_worker_crashed` | Worker loop threw unexpectedly |
| `pos_outbox_backlog_high` | Pending queue past threshold |

## Security note for the team

POS credentials are stored **encrypted at rest** (AES-256-GCM) in store settings, never committed. ⚠️ **The credential used during API discovery must be rotated before production** — treat the value in the discovery transcript as compromised.

## What's explicitly out of scope (so nobody assumes it's there)

- Inbound sync (POS → us) — we only push
- Per-product line items / inventory sync in the POS
- Returns / refunds — handled entirely on the POS side
- A separate worker process or external queue (Redis/BullMQ) — in-process worker for now; graduating later is a deploy change, not a rewrite
