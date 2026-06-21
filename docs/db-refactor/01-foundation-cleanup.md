# Phase 1 — Foundation Cleanup (integrity • money • indexes • naming)

## Goal
A single, mostly **invisible** correctness pass across every table except the catalog
(which Phase 2 reshapes): re-add foreign keys, convert **all** money to `Decimal`, add the
missing indexes, normalize the duplicated delivery-zone fields, replace review vote arrays
with a join table, and standardize PrintJob naming (including its raw SQL). No new
user-facing features.

## Data strategy
Reseed, preserving `users`/`roles`/`user_roles`. With no orders/credits, FK additions are
orphan-free by construction. `order_items` / `cart_items` are **empty** and are reshaped in
Phase 2 (variant flip) — so this phase leaves them alone.

## Schema changes (`backend/prisma/schema.prisma`)
**Foreign keys (with `onDelete`):**
- `user_roles` → users (Cascade), roles (Cascade)
- `orders.userId` → users (Restrict)
- `credit_transactions` → users (Restrict), `orderId` → orders (SetNull), `createdBy` → users (SetNull)
- `reviews` → users (Cascade), products (Cascade)   *(products FK finalized in Phase 2)*
- `notifications.recipientUserId` → users (Cascade)
- `contact_messages.userId` → users (SetNull), `orderId` → orders (SetNull)
- `print_jobs.orderId` → orders (Cascade)

**Money → Decimal (all at once):**
- `orders`: `total` → `Decimal(12,2)`; **add** `subtotal`, `tax`, `deliveryFee`,
  `discountTotal` `Decimal(12,2)`, `taxRate Decimal(6,4)` (snapshot rate at purchase).
- `users.creditBalance` → `Decimal(12,2)`
- `credit_transactions.amount` → `Decimal(12,2)`; **add** `balanceAfter Decimal(12,2)`.

**Indexes:** `orders(userId)`, `orders(status)`, `orders(createdAt)`,
`credit_transactions(userId, createdAt)`, `reviews(productId)`, `contact_messages(userId)`,
`contact_messages(status)`. (notifications/print_jobs already indexed.)

**Delivery-zone dedupe/rename** — unify identical names on **both** users and orders:
`deliveryStatus`, `deliverySource`, `deliveryDistanceMiles`, `deliveryThresholdMiles`,
`deliveryCheckedAt` (distances stay `Float` — not money). Removes the
`deliveryEligibilitySource`/`deliveryZoneSource` naming split.

**Reviews — votes to a join table:**
```
ReviewVote  id, reviewId -> reviews (Cascade), userId -> users (Cascade),
            kind ReviewVoteKind, createdAt   @@unique([reviewId, userId])
enum ReviewVoteKind { HELPFUL NOT_HELPFUL }
reviews: drop votedByHelpful/votedByNotHelpful Int[]; keep helpful/notHelpful as cached
counters; add @@unique([userId, productId]) (one review per user per product).
```

**PrintJob naming:** rename physical columns `order_id→orderId`, `payload_json→payloadJson`,
`created_at→createdAt`, `claimed_at→claimedAt`, `completed_at→completedAt`,
`failed_at→failedAt`, `claimed_by_agent_id→claimedByAgentId`, `native_job_id→nativeJobId`,
`attempt_count→attemptCount`, `last_error_code→lastErrorCode`,
`last_error_message→lastErrorMessage`; drop the `@map`s.

## Backend changes (`backend/src`)
- `services/printJob.service.ts` — **update the raw SQL** (the `FOR UPDATE SKIP LOCKED`
  claim query ~lines 64–96 and row mapping ~177+) to the new camelCase column names. This
  is the "printer agent" change; the external HTTP agent payload is unchanged.
- `services/credit.service.ts` — `Decimal` math; write `balanceAfter` per entry inside the
  balance-update transaction; add a reconcile helper (ledger sum == cached balance).
- `services/deliveryEligibility.service.ts` — read/write unified field names; one mapper
  reused for the User cache and the Order snapshot.
- `services/review.service.ts` — vote/unvote upsert on `ReviewVote` (flip `kind`) +
  adjust cached counters in one transaction; "has user voted" = `findUnique`.
- `services/order.service.ts` — `Decimal` order totals (subtotal/tax/total); begin
  replacing manual `findMany({ where: { id: { in } } })` + Map joins with relation
  `include`s now that FKs exist.
- **API mapper** — serialize `Decimal` → `number` for all money fields.

## Frontend changes (`web/src`)
- **Money reads unaffected** (Decimal→number keeps `total`/`creditBalance` numeric).
- Delivery-zone renames: `features/cart/checkout/FulfillmentSelector.jsx`,
  `features/orders/OrderDetailPanel.jsx`,
  `features/dashboard/components/PendingRegistrationsSection.jsx`,
  `App.deliveryEligibility.e2e.test.jsx`.
- Review votes: `components/product/ProductReviews.jsx`, `context/AppContext.jsx` →
  read a `myVote` flag (HELPFUL|NOT_HELPFUL|null) instead of array membership; counts
  unchanged. Update `data/mockData.js` + review tests.
- Credit: `features/dashboard/components/CreditsSection.jsx`, `CreditModal.jsx` — show
  `balanceAfter`.

## API contract impact
- **Breaking:** delivery-zone field renames (consider **dual-emit** old+new for one release
  so backend/frontend needn't ship in the same instant); review responses drop the vote
  arrays in favor of `myVote`.
- **Additive:** order money breakdown, `credit_transactions.balanceAfter`.
- **Compatible:** all money stays `number` on the wire.

## Tests & verification
- Update `credit.service.test.ts` (Decimal + balanceAfter + reconcile),
  `review.service.test.ts` (vote upsert/flip, unique enforcement),
  `printJob.service.test.ts` + `integration/printJob.routes.test.ts` (raw SQL rename —
  claim/complete cycle, SKIP LOCKED concurrency), `deliveryEligibility.service.test.ts`,
  `order.service*.test.ts` (Decimal totals, relation includes).
- Frontend: review/credit/fulfillment component + e2e fixtures.
- Verify: `users` preserved across reseed; print-agent claim cycle works after rename;
  credit reconcile passes; `npm run test:backend` + `test:web` + `test:e2e` green.
</content>
