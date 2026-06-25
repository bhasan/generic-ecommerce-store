# Architecture Review — Ecommerce Platform

> Reviewed against commit `f5a9399` on branch `develop`, June 2026.
> Stack: Node/Express + Prisma/PostgreSQL + React (no Redux).

---

## What's Well-Built

### 1. Clean layered backend

`routes → controllers → services → Prisma` with no leakage. Controllers are thin; business logic lives in services. The boundary is held consistently across all ~20 domains. Adding a new feature follows an obvious path and doesn't require touching unrelated layers.

### 2. Strategy registries for payment and fulfillment

`services/payments/` and `services/fulfillment/` use a registry/strategy pattern. Each payment method and delivery mode registers `validate`, `initialStatus`, and `applyInTransaction` implementations. Adding a new payment provider does not touch `order.service.ts` — it registers a strategy. This is the best architectural decision in the codebase for long-term ecommerce extensibility.

### 3. Money is `Decimal(12,2)`, never `float`

Order totals, prices, store credit, and tax rate (`Decimal(6,4)`) are stored as fixed-point Decimal. This prevents the classical floating-point rounding bugs that cause financial discrepancies in ecommerce systems. The Decimal serialization middleware ensures these never silently become JavaScript floats in API responses.

### 4. Full order auditability

- `OrderStatusEvent` — every status transition with `fromStatus`, `toStatus`, `changedBy`, and `note`
- `Payment` rows per payment attempt, including raw `gatewayResponse` JSON
- `StoreCreditTransaction` with `balanceAfter` for an immutable ledger

You can reconstruct the complete financial history of any order. This is essential for dispute resolution and accounting reconciliation.

### 5. Real variant-based catalog model

`Product → ProductVariant → {VariantQuantityOption, VariantPriceBreak}` with per-variant SKU, stock, and pricing mode. This is a genuine catalog model — not a simplified "product has one price" design. Quantity-based price breaks (e.g., buy 1g at $15, buy 3.5g at $40) are first-class.

### 6. Security posture above average for this stage

- AES-256-GCM encryption for payment gateway credentials at rest
- `helmet`, tiered rate limiting by route class
- RBAC middleware with role-check tests
- `express-validator` + Zod dual-layer validation at the boundary

### 7. Settings abstraction

`SettingsStore<T>` with Zod schema validation, a TTL cache, and factory helpers (`createSettingsApi`, `createResourceApi`) that collapsed per-domain CRUD boilerplate. Adding a new settings domain is now 20 lines, not 200.

---

## Architectural Risks

### 🔴 Blocks horizontal scaling

These must be addressed before running more than one backend instance.

**In-memory state assumes a single process**

`settingsStore.ts` carries a module-level TTL cache and documents this explicitly:

> *"Single-process only. If it is ever scaled horizontally, each process keeps its own copy and config can be up to one TTL stale between instances. Move to a shared store (e.g. Redis) at that point."*

The geocoding service has a similar module-level cache. Any in-process job polling or interval also fires per-instance under horizontal scale.

*Fix path:* Redis for shared cache and job queues. The code documents the contract, which makes the migration localized.

**Uploads go to local disk**

Images are stored to the container filesystem and served from `/api/uploads/`. This couples every media asset to a single machine. Two instances can't share files; zero-downtime redeploys and autoscaling are not possible without a shared volume.

*Fix path:* Object storage (S3/R2) with a CDN in front. The upload controller is the only component to change.

**JWT in `localStorage` with no refresh or revocation**

`authToken` lives in `localStorage` (accessible to XSS), expires in 24h, and there is no refresh token or server-side revocation mechanism. A leaked token is valid for up to 24h with no kill switch.

*Fix path:* httpOnly cookie, short-lived access token (15–30 min), refresh token rotation. Once Redis exists, revocation is a small addition.

---

### 🟠 Correctness under concurrency

These are correctness bugs that can occur at any traffic level.

**Stock check-then-act race (oversell risk)**

In `order.service.ts`, stock is validated *outside* the database transaction:

```ts
// line ~365 — OUTSIDE the $transaction
if (variant.stockEnabled && variant.stock.toNumber() < item.quantity) {
  throw new AppError(`Insufficient stock for ${variant.product.name}`, 400);
}

// line ~437 — INSIDE the $transaction
await tx.productVariant.update({
  where: { id: variant.id },
  data: { stock: { decrement: item.quantity } }
});
```

Two concurrent orders for the last unit can both pass the read-time guard and both decrement. Prisma's atomic `decrement` prevents lost updates but does not prevent the stock from going negative because there is no guard on the write side.

*Fix path (cheapest):* Add a database `CHECK (stock >= 0)` constraint as a hard stop. *Fix path (complete):* Move the stock check inside the transaction with a conditional update — `updateMany({ where: { id, stock: { gte: quantity } } })` — and check that `count === 1`, or use `SELECT … FOR UPDATE` to acquire a row lock before decrementing.

**No idempotency on order or payment creation**

A double-submit or retry can create duplicate orders. There is a `@unique` constraint on `Payment.transactionId` which prevents some duplicates at the payment level, but there is no order-level idempotency key.

*Fix path:* Accept an `Idempotency-Key` header on order creation; store it with a short TTL (Redis or a DB column) and return the existing order on collision.

---

### 🟡 Performance at catalog and traffic growth

These are fine today and will hurt at scale.

**Search uses `ILIKE %term%`**

`searchProducts` runs `contains: term, mode: 'insensitive'` on `name` and `description`. A leading-wildcard `ILIKE '%term%'` cannot use a B-tree index and performs a full table scan. This is acceptable at hundreds of products; it degrades visibly at tens of thousands.

*Fix path:* Postgres full-text search (`tsvector` column + GIN index) is a low-friction upgrade within the existing stack. A dedicated search engine (Meilisearch, Typesense) is the next tier.

**Offset pagination (`skip`/`take`)**

Deep offset pagination scans and discards rows. `skip: 10000` reads 10,001 rows to return 20. Fine for admin tables, poor for customer-facing infinite scroll at scale.

*Fix path:* Keyset/cursor pagination on customer-facing list endpoints. Admin pagination can stay offset-based.

**Frontend `AppContext` is a 1,280-line god-object**

Auth, cart, products, orders, landing page config, and store config all live in one context provider. Every consumer re-renders on any slice change. The file is a merge-conflict magnet and has already caused conflicts in this codebase.

*Fix path:* Split into focused contexts (Auth / Cart / Catalog) or a lightweight store (Zustand). Server state (products, orders) is a natural fit for React Query, which would replace the hand-rolled caching and refetch logic.

**`order.service.ts` is 1,061 lines**

The strategy pattern extracted payment and fulfillment, but the orchestrator is still large. It is the file most likely to accumulate the next set of tangled concerns.

---

## Missing for a Production Ecommerce Platform

| Gap | Impact | Fix path |
|---|---|---|
| No idempotency keys | Duplicate orders on retry | `Idempotency-Key` header + short-TTL store |
| No async event backbone | Slow email/print blocks checkout | Outbox pattern; message queue |
| Flat tax rate | Wrong tax in multi-jurisdiction delivery | Tax service (TaxJar, Avalara) at the boundary |
| Single tenant | Multi-store retrofitting is expensive | Decide now; `tenantId` on every model if needed |
| No search indexing | Full-table scan on product search | Postgres FTS or Meilisearch |

---

## Prioritised Remediation

| Priority | Item | Effort | Why now |
|---|---|---|---|
| 1 | **Stock race fix** | Hours | Correctness; cheap; localized to `order.service.ts` |
| 2 | **Object storage for uploads** | Days | Prerequisite for multi-instance deployment |
| 3 | **Redis cache + queue** | Days | Unblocks horizontal scale; removes single-process caveat |
| 4 | **Auth hardening** (httpOnly + refresh) | Days | Reduces breach window; required for Redis anyway |
| 5 | **Postgres full-text search** | Hours | One migration + index; no new infrastructure |
| 6 | **AppContext split / React Query** | Week | Reduces re-renders; eliminates god-object churn |

Items 1–4 are prerequisites for a horizontally scalable deployment. Items 5–6 are quality-of-life for the engineering team and performance for the customer.

---

## Summary

For a single store on a single server, this is a well-architected codebase. The layering is clean, the domain model is real (variant pricing, audit trails, strategy-based extensibility), and the security baseline is above average for this stage.

The architecture is **not yet horizontally scalable**, concentrated in four areas: in-memory state, local-disk uploads, localStorage JWTs, and the stock race condition. None require a rewrite. The layering that already exists means each fix is a swap at one layer, not a cross-cutting change. The order to do them is above.
