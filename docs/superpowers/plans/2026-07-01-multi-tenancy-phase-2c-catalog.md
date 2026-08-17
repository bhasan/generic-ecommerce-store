# Multi-Tenancy Phase 2c — Per-Store Catalog & Checkout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Give each store its own stock, and optional price/availability overrides, over the shared tenant catalog — with the customer seeing the active store's effective price/stock/availability, checkout decrementing the active store's stock atomically, and POS syncing to the active store. Single-store tenants (default store, no overrides) behave exactly as today.

**Architecture:** New `StoreVariantOverride` (storeId+variantId → stock, optional price/active) with a real store FK (it never stores the `0` sentinel). A pure `resolveVariantEffective(variant, override, isDefaultStore)` computes effective price/stock/available; product reads apply it transparently (replacing `basePrice`/`stock`/`active` in the response). Checkout decrements the active store's override row (or `variant.stock` for the default store). POS-outbox per-store resolution comes free from 2b (store-scoped `store_settings`).

**Tech Stack:** Express + TypeScript, Prisma, Vitest, Playwright. Container: `docker exec generic-ecommerce-store-delivery-backend sh -c 'cd /app && npx vitest run <path>'`.

## Global Constraints
- **Backward-compat:** default store, no overrides → `variant.stock`/`basePrice`/`active` unchanged. Full backend suite + E2E stay green.
- **`StoreVariantOverride.storeId` HAS a store FK** (real ids only, never `0`), `variantId` FK, `@@unique([storeId, variantId])`, `stock >= 0` check. It IS store-scoped (add to `STORE_SCOPED_TABLES`)? NO — see Task 1: it is read/written with explicit `storeId` (the ACTIVE store, or a chosen store in 2e), so keep it OUT of `STORE_SCOPED_TABLES` and pass `storeId` explicitly; it carries `tenantId` for tenant isolation via the extension.
- Effective values are computed with `storeId 0` never appearing (overrides are per real store). Depends on 2b's `isDefaultStore` on the context.
- Hand-authored migrations via `migrate deploy`. Timestamps sort after `20260701010000_uisetting_store_scope`.
- Standard commit trailers.

---

### Task 1: `StoreVariantOverride` schema + migration

**Files:** Modify `backend/prisma/schema.prisma`; create `backend/prisma/migrations/20260701020000_store_variant_override/migration.sql`; Test `backend/src/integration/tenantUniqueConstraints.test.ts` (extend).

**Interfaces:** Produces the `StoreVariantOverride` model: `{ id, tenantId, storeId, variantId, stock Decimal(12,3), priceOverride Decimal(12,2)?, activeOverride Boolean?, createdAt, updatedAt }`, `@@unique([storeId, variantId])`, FKs on `storeId`→`stores` and `variantId`→`product_variants` (both `onDelete: Cascade`), `stock >= 0` check.

- [ ] **Step 1: Failing test** — extend `tenantUniqueConstraints.test.ts`: two different stores can each have an override for the same variant; a second override for the same (store, variant) is rejected; `stock = -1` is rejected. (Use `getUnscopedPrisma()`, create tenant+2 stores+product+variant, `storeVariantOverride.create`; clean up.) Run → FAIL (model absent).

- [ ] **Step 2: Schema.** Add to `ProductVariant`: `storeOverrides StoreVariantOverride[]`. Add model:
```prisma
model StoreVariantOverride {
  id            Int             @id @default(autoincrement())
  tenantId      Int
  storeId       Int
  variantId     Int
  stock         Decimal         @default(0) @db.Decimal(12, 3)
  priceOverride Decimal?        @db.Decimal(12, 2)
  activeOverride Boolean?
  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @updatedAt
  store         Store           @relation(fields: [storeId], references: [id], onDelete: Cascade)
  variant       ProductVariant  @relation(fields: [variantId], references: [id], onDelete: Cascade)
  @@unique([storeId, variantId])
  @@index([tenantId])
  @@index([variantId])
  @@map("store_variant_overrides")
}
```
Add `storeVariantOverrides StoreVariantOverride[]` to the `Store` model.

- [ ] **Step 3: Migration** `20260701020000_store_variant_override/migration.sql`:
```sql
CREATE TABLE "store_variant_overrides" (
  "id" SERIAL PRIMARY KEY,
  "tenantId" INTEGER NOT NULL,
  "storeId" INTEGER NOT NULL,
  "variantId" INTEGER NOT NULL,
  "stock" DECIMAL(12,3) NOT NULL DEFAULT 0,
  "priceOverride" DECIMAL(12,2),
  "activeOverride" BOOLEAN,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "store_variant_overrides_stock_nonneg" CHECK ("stock" >= 0)
);
CREATE UNIQUE INDEX "store_variant_overrides_storeId_variantId_key" ON "store_variant_overrides"("storeId","variantId");
CREATE INDEX "store_variant_overrides_tenantId_idx" ON "store_variant_overrides"("tenantId");
CREATE INDEX "store_variant_overrides_variantId_idx" ON "store_variant_overrides"("variantId");
ALTER TABLE "store_variant_overrides" ADD CONSTRAINT "svo_store_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE;
ALTER TABLE "store_variant_overrides" ADD CONSTRAINT "svo_variant_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE CASCADE;
```

- [ ] **Step 4: Add to `tenantScope.ts`** — `store_variant_overrides` is TENANT-scoped (add nothing to STORE_SCOPED; the extension will inject `tenantId`). It is NOT in `UNSCOPED_TABLES`. (Default = tenant-scoped, which is what we want.) Confirm no change needed beyond the model existing.

- [ ] **Step 5:** `migrate deploy` + `prisma generate`. Run the test → PASS. Full suite + tsc → green.
- [ ] **Step 6: Commit** `feat(phase2c): StoreVariantOverride (per-store stock + optional price/active)`.

---

### Task 2: `resolveVariantEffective` — pure effective-value resolver

**Files:** Create `backend/src/services/storeVariant.effective.ts`; Test `backend/src/services/storeVariant.effective.test.ts`.

**Interfaces:** Produces
```ts
export interface VariantOverrideLike { stock: Prisma.Decimal | number; priceOverride: Prisma.Decimal | number | null; activeOverride: boolean | null; }
export interface EffectiveVariant { price: number; stock: number; active: boolean; available: boolean; }
export function resolveVariantEffective(
  variant: { basePrice: Prisma.Decimal; stock: Prisma.Decimal; stockEnabled: boolean; active: boolean },
  override: VariantOverrideLike | undefined,
  isDefaultStore: boolean,
): EffectiveVariant
```
Rules: `price = override?.priceOverride ?? variant.basePrice`; `stock = override ? override.stock : (isDefaultStore ? variant.stock : 0)`; `active = override?.activeOverride ?? variant.active`; `available = active && (!variant.stockEnabled || stock > 0)`. All money/stock as `number` (via `.toNumber()`), matching the serializeDecimal response convention.

- [ ] **Step 1: Failing test (table-driven)** — cover the matrix:
```ts
import { describe, it, expect } from 'vitest';
import { Prisma } from '../../generated/prisma';
import { resolveVariantEffective } from './storeVariant.effective';
const D = (n: number) => new Prisma.Decimal(n);
const base = { basePrice: D(10), stock: D(5), stockEnabled: true, active: true };
describe('resolveVariantEffective', () => {
  const cases: Array<[string, any, any, boolean, { price: number; stock: number; active: boolean; available: boolean }]> = [
    ['default store, no override → variant values', base, undefined, true,  { price: 10, stock: 5, active: true, available: true }],
    ['non-default store, no override → out of stock', base, undefined, false, { price: 10, stock: 0, active: true, available: false }],
    ['override stock only', base, { stock: D(3), priceOverride: null, activeOverride: null }, false, { price: 10, stock: 3, active: true, available: true }],
    ['override price', base, { stock: D(3), priceOverride: D(8), activeOverride: null }, false, { price: 8, stock: 3, active: true, available: true }],
    ['override hides variant', base, { stock: D(3), priceOverride: null, activeOverride: false }, false, { price: 10, stock: 3, active: false, available: false }],
    ['stock disabled → available regardless of stock', { ...base, stockEnabled: false }, undefined, false, { price: 10, stock: 0, active: true, available: true }],
  ];
  it.each(cases)('%s', (_n, v, o, isDef, expected) => {
    expect(resolveVariantEffective(v, o, isDef)).toEqual(expected);
  });
});
```
Run → FAIL.

- [ ] **Step 2: Implement** per the rules above (`.toNumber()` conversions; `override.stock`/`priceOverride` may be Decimal or number — normalize with `Number(...)`). Run → PASS. Full suite + tsc green.
- [ ] **Step 3: Commit** `feat(phase2c): resolveVariantEffective effective price/stock/availability`.

---

### Task 3: Product reads apply per-store effective values

**Files:** Modify `backend/src/services/product.service.ts`; Test `backend/src/integration/storeCatalog.test.ts` (new, real DB).

**Interfaces:** Consumes `resolveVariantEffective`, `getTenantContext()` (`storeId`, `isDefaultStore`). Produces: `getProducts`/`getProduct` return each variant with `basePrice`, `stock`, `active` REPLACED by the active store's effective values (so existing frontend/response shape is unchanged), plus availability reflected. A helper `applyStoreOverrides(products)` fetches `storeVariantOverride.findMany({ where: { storeId, variantId: { in } } })` for the active store, maps by variantId, and rewrites each variant.

- [ ] **Step 1: Failing integration test** (`storeCatalog.test.ts`) — tenant with default store D + non-default store S; a variant with `basePrice 10, stock 5`; an override for S `{ stock: 2, priceOverride: 8 }`. Under D context (`runWithTenant({…storeId:D, isDefaultStore:true})`) `getProducts` → variant `basePrice 10, stock 5`. Under S context (`isDefaultStore:false`) → variant `basePrice 8, stock 2`. A variant with no override under S → `stock 0`. Run → FAIL (overrides not applied).

- [ ] **Step 2: Implement** `applyStoreOverrides` in `product.service.ts` and call it at the end of `getProducts`, `getProduct`, and the search-hydration path (wherever products with variants are returned to customers). For the DEFAULT store with no overrides the effective values equal the variant values, so single-store behavior is unchanged. Convert Decimals to numbers consistently with the existing serialization (the `serializeDecimal` middleware already turns Decimals→numbers in responses; here we REPLACE the values, so return `basePrice`/`stock` as the effective values — keep them as Prisma.Decimal if the shape expects Decimal, else number; match the current field type the service returns). Verify the existing product tests still pass (they run under a default-store context → unchanged).

- [ ] **Step 3:** Run `storeCatalog.test.ts` + `product.service.test.ts` → PASS. Full suite + tsc green.
- [ ] **Step 4: Commit** `feat(phase2c): product reads apply per-store effective price/stock/availability`.

---

### Task 4: Checkout — per-store atomic stock decrement + effective price

**Files:** Modify `backend/src/services/order.crud.service.ts`; Test `backend/src/integration/order.routes.test.ts` or a focused `storeCheckout.test.ts` (new).

**Interfaces:** Consumes `getTenantContext()` (`storeId`, `isDefaultStore`), `resolveVariantEffective`. Produces: `decrementStockGuarded` gains store awareness — for the default store it decrements `variant.stock` (unchanged); for a non-default store it atomically decrements the `StoreVariantOverride.stock` row for `(storeId, variantId)`, guarded by `stock >= quantity`; if no override row exists for a non-default store, that's insufficient stock (a non-stocked store can't sell). `createOrder` prices line items at the effective per-store price.

- [ ] **Step 1: Failing test** — under a NON-default store S with an override `{ stock: 2, priceOverride: 8 }`: an order of qty 2 succeeds, decrements the OVERRIDE row to 0 (not `variant.stock`), and the line unit price is 8; a second qty-1 order fails "Insufficient stock". Under the default store: unchanged (decrements `variant.stock`). Run → FAIL.

- [ ] **Step 2: Implement.**
  - New signature `decrementStockGuarded(tx, variantId, quantity, productName, opts: { storeId: number; isDefaultStore: boolean })`. If `isDefaultStore`: existing `tx.productVariant.updateMany({ where: { id: variantId, stock: { gte: quantity } }, data: { stock: { decrement: quantity } } })`. Else: `tx.storeVariantOverride.updateMany({ where: { storeId: opts.storeId, variantId, stock: { gte: quantity } }, data: { stock: { decrement: quantity } } })`; `result.count === 0` → `Insufficient stock`.
  - In `createOrder`/`addItemToOrder`: read `const ctx = getTenantContextOrThrow()`; pass `{ storeId: ctx.storeId!, isDefaultStore: !!ctx.isDefaultStore }` to `decrementStockGuarded`; compute `unitPrice` from `resolveVariantEffective(variant, overrideForStore, isDefaultStore).price` (fetch the override for the active store alongside the variant lookup, e.g. add `include: { storeOverrides: { where: { storeId } } }` to the variant `findMany`, or a parallel override fetch keyed by variantId).
  - Keep the whole thing inside the existing transaction so the atomic guard holds.

- [ ] **Step 3:** Run the checkout test + existing `order.routes.test.ts` → PASS. Full suite + tsc green.
- [ ] **Step 4: Commit** `feat(phase2c): checkout decrements the active store's stock and prices at its effective price`.

---

### Task 5: Cross-store isolation guardrail + per-store POS-outbox verification

**Files:** Create `backend/src/integration/storeIsolation.test.ts`; Create `backend/src/services/pos/orders/outboxPerStore.test.ts` (or extend `outboxWorker.test.ts`).

- [ ] **Step 1: `storeIsolation.test.ts`** (mirror `tenantIsolation.test.ts`): under store-A context, `getProducts`/orders reflect A's overrides/stock and never B's; an order created under store A has `storeId = A` and is not visible under store B's context (store-scoped `order` query returns empty); a `StoreVariantOverride` written for A is not returned when reading overrides under B. Run → should PASS with the current impl (it's a guardrail — if it FAILS, there's a real leak to fix). If it fails, fix the leak, then it passes.

- [ ] **Step 2: POS-outbox per-store** — verify the outbox resolves POS from the ROW's store: with two stores having different `store_settings.posConfig` (store-scoped from 2b), a row for store A resolves store A's provider config and a row for store B resolves store B's. (The outbox already re-enters `runWithTenant({ tenantId, storeId: row.storeId })` per row — Phase 1 — and `getStoreSettings()` is store-scoped after 2b, so this should pass with no new code; the test locks it.) If it needs the `isDefaultStore` flag for the row's store, set it from the row's store `isDefault`.

- [ ] **Step 3:** Both green. Full suite + tsc green.
- [ ] **Step 4: Commit** `test(phase2c): cross-store isolation guardrail + per-store POS-outbox`.

---

### Task 6: Per-store oversell E2E (extend `stock-race`)

**Files:** Modify `e2e/flows/stock-race.spec.ts`.

- [ ] **Step 1:** Add a case: seed a non-default store S with a variant override `stock: 1`; fire two concurrent orders for that variant at store S (via `X-Store-Id: S`); exactly one succeeds, one gets insufficient stock — and a concurrent order for the SAME variant at the DEFAULT store is unaffected (independent inventory). Mirror the existing race helper in the file; use the store-selection header. Run the spec → PASS.
- [ ] **Step 2: Commit** `test(phase2c): per-store oversell protection e2e`.

---

## After 2c
Full backend suite + full E2E green (backward-compat gate). Then **2d (store picker)**.
