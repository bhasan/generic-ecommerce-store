// backend/src/integration/storeIsolation.test.ts
//
// Cross-store isolation guardrail (CI guardrail #3 — Task 5, Phase 2c).
// Mirrors tenantIsolation.test.ts: real DB, getUnscopedPrisma() for setup/teardown,
// runWithTenant + getTenantPrisma() for all assertions.
//
// Verifies within ONE tenant with TWO stores (A and B):
//  1. getProducts under store A reflects A's StoreVariantOverride values.
//  2. getProducts under store B does NOT show A's override (base values only).
//  3. A StoreVariantOverride written for store A is absent when querying overrides
//     filtered by store B's storeId.
//  4. An order created (raw) under store A's storeId has storeId = A in the DB.
//  5. That order is invisible when querying orders under store B's context.
//  6. Store B's order is invisible under store A's context.
//
// This is a GUARDRAIL: it MUST pass with the current implementation.
// If any assertion FAILS, a real cross-store data leak was found — stop and report.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Prisma } from '../../generated/prisma';
import { getUnscopedPrisma, getTenantPrisma } from '../config/database';
import { runWithTenant } from '../config/tenantContext';
import { ProductService } from '../services/product.service';

const base = getUnscopedPrisma();
const svc = new ProductService();

let tenantId: number;
let storeA: number;
let storeB: number;
let userId: number;
let variantId: number;
let ordAId: number;
let ordBId: number;

beforeAll(async () => {
  // ── Tenant ──────────────────────────────────────────────────────────────────
  const tenant = await base.tenant.create({
    data: { slug: `xsi-${Date.now()}`, name: 'XStoreIso' },
  });
  tenantId = tenant.id;

  // ── Two non-default stores ───────────────────────────────────────────────────
  // Stores is UNSCOPED — write directly via base client.
  const a = await base.store.create({
    data: { tenantId, name: 'Store A', slug: 'store-a', isDefault: false },
  });
  const b = await base.store.create({
    data: { tenantId, name: 'Store B', slug: 'store-b', isDefault: false },
  });
  storeA = a.id;
  storeB = b.id;

  // ── User (raw insert — avoids UserRole side-effects) ───────────────────────
  const userRows = await base.$queryRawUnsafe<Array<{ id: number }>>(
    `INSERT INTO users (username, password, approved, "createdAt", "updatedAt", "tenantId")
     VALUES ($1, 'x', true, now(), now(), $2) RETURNING id`,
    `xsi-user-${Date.now()}`,
    tenantId,
  );
  userId = userRows[0].id;

  // ── Category ───────────────────────────────────────────────────────────────
  const catRows = await base.$queryRawUnsafe<Array<{ id: number }>>(
    `INSERT INTO categories (name, "tenantId", "createdAt", "updatedAt")
     VALUES ('XSICat', $1, now(), now()) RETURNING id`,
    tenantId,
  );
  const catId = catRows[0].id;

  // ── Product ────────────────────────────────────────────────────────────────
  const prodSlug = `xsi-prod-${Date.now()}`;
  const prodRows = await base.$queryRawUnsafe<Array<{ id: number }>>(
    `INSERT INTO products
       (name, slug, "categoryId", "tenantId", hidden, "vipOnly", "cardSize", "sortOrder", "createdAt", "updatedAt")
     VALUES ('XSI Product', $1, $2, $3, false, false, 'STANDARD', 0, now(), now()) RETURNING id`,
    prodSlug, catId, tenantId,
  );
  const productId = prodRows[0].id;

  // ── Variant: basePrice = 50, base stock = 10 ───────────────────────────────
  const varRows = await base.$queryRawUnsafe<Array<{ id: number }>>(
    `INSERT INTO product_variants
       (label, sku, "pricingMode", "basePrice", stock, "stockEnabled", "isDefault",
        active, "sortOrder", "productId", "tenantId", "createdAt", "updatedAt")
     VALUES ('V1', $1, 'UNIT', 50, 10, true, true, true, 0, $2, $3, now(), now()) RETURNING id`,
    `xsi-v1-${Date.now()}`, productId, tenantId,
  );
  variantId = varRows[0].id;

  // ── StoreVariantOverride for store A ONLY: price = 99, stock = 99 ──────────
  // store_variant_overrides is NOT store-scoped → must supply storeId explicitly.
  await base.storeVariantOverride.create({
    data: {
      tenantId,
      storeId: storeA,
      variantId,
      stock: new Prisma.Decimal(99),
      priceOverride: new Prisma.Decimal(99),
    },
  });

  // ── Orders: one per store (raw — needs both tenantId and storeId) ───────────
  const oaRows = await base.$queryRawUnsafe<Array<{ id: number }>>(
    `INSERT INTO orders
       ("userId", status, subtotal, tax, "deliveryFee", "discountTotal", total,
        "taxRate", "deliveryMethod", "paymentMethod", "createdAt", "updatedAt", "tenantId", "storeId")
     VALUES ($1, 'PENDING', 0, 0, 0, 0, 0, 0, 'DELIVERY', 'EXTERNAL', now(), now(), $2, $3) RETURNING id`,
    userId, tenantId, storeA,
  );
  ordAId = oaRows[0].id;

  const obRows = await base.$queryRawUnsafe<Array<{ id: number }>>(
    `INSERT INTO orders
       ("userId", status, subtotal, tax, "deliveryFee", "discountTotal", total,
        "taxRate", "deliveryMethod", "paymentMethod", "createdAt", "updatedAt", "tenantId", "storeId")
     VALUES ($1, 'PENDING', 0, 0, 0, 0, 0, 0, 'DELIVERY', 'EXTERNAL', now(), now(), $2, $3) RETURNING id`,
    userId, tenantId, storeB,
  );
  ordBId = obRows[0].id;
});

afterAll(async () => {
  // Delete in FK-dependency order (Restrict constraints propagate).
  await base.$executeRawUnsafe(`DELETE FROM orders WHERE "tenantId" = $1`, tenantId);
  await base.$executeRawUnsafe(`DELETE FROM store_variant_overrides WHERE "tenantId" = $1`, tenantId);
  await base.$executeRawUnsafe(`DELETE FROM product_variants WHERE "tenantId" = $1`, tenantId);
  await base.$executeRawUnsafe(`DELETE FROM products WHERE "tenantId" = $1`, tenantId);
  await base.$executeRawUnsafe(`DELETE FROM categories WHERE "tenantId" = $1`, tenantId);
  await base.$executeRawUnsafe(`DELETE FROM users WHERE "tenantId" = $1`, tenantId);
  // Stores cascade from tenant deletion, but delete explicitly for clarity.
  await base.store.deleteMany({ where: { tenantId } });
  await base.tenant.delete({ where: { id: tenantId } });
});

describe('cross-store isolation guardrail (CI guardrail #3)', () => {
  // ── Catalog: per-store effective values ──────────────────────────────────────

  it('under store A context: getProducts reflects A override (price=99, stock=99)', async () => {
    const products = await runWithTenant(
      { tenantId, storeId: storeA, isDefaultStore: false, scope: 'tenant' },
      async () => svc.getAllProducts(),
    );
    const v = products.flatMap((p) => p.variants).find((v) => v.id === variantId);
    expect(v).toBeDefined();
    expect(Number(v!.basePrice)).toBe(99);
    expect(Number(v!.stock)).toBe(99);
  });

  it('under store B context: getProducts shows BASE values (no A override bleeds in)', async () => {
    const products = await runWithTenant(
      { tenantId, storeId: storeB, isDefaultStore: false, scope: 'tenant' },
      async () => svc.getAllProducts(),
    );
    const v = products.flatMap((p) => p.variants).find((v) => v.id === variantId);
    expect(v).toBeDefined();
    // store B has no override: price stays at basePrice, stock falls to 0
    // (resolveVariantEffective returns 0 stock for a non-default store with no override).
    expect(Number(v!.basePrice)).toBe(50);
    expect(Number(v!.stock)).toBe(0);
  });

  // ── StoreVariantOverride: explicit storeId filter is exclusive ───────────────

  it('StoreVariantOverride for A is NOT returned when filtering by store B\'s storeId', async () => {
    // store_variant_overrides is tenant-scoped (not store-scoped): the extension
    // injects tenantId but NOT storeId. The explicit storeId filter below matches
    // only store B's overrides — store A's override must not appear.
    const overridesForB = await runWithTenant(
      { tenantId, storeId: storeB, isDefaultStore: false, scope: 'tenant' },
      async () =>
        getTenantPrisma().storeVariantOverride.findMany({
          where: { storeId: storeB, variantId },
        }),
    );
    expect(overridesForB).toHaveLength(0);
    expect(overridesForB.find((o) => o.storeId === storeA)).toBeUndefined();
  });

  it('StoreVariantOverride for A IS returned when filtering by store A\'s storeId', async () => {
    const overridesForA = await runWithTenant(
      { tenantId, storeId: storeA, isDefaultStore: false, scope: 'tenant' },
      async () =>
        getTenantPrisma().storeVariantOverride.findMany({
          where: { storeId: storeA, variantId },
        }),
    );
    expect(overridesForA).toHaveLength(1);
    expect(Number(overridesForA[0].priceOverride)).toBe(99);
  });

  // ── Orders: ORM-level store scoping ─────────────────────────────────────────

  it('order created under store A has storeId = A in the database', async () => {
    const row = await base.order.findUnique({ where: { id: ordAId } });
    expect(row?.storeId).toBe(storeA);
    expect(row?.tenantId).toBe(tenantId);
  });

  it('store A order is NOT visible under store B context (store-scoped ORM filter)', async () => {
    const orders = await runWithTenant(
      { tenantId, storeId: storeB, isDefaultStore: false, scope: 'tenant' },
      async () => getTenantPrisma().order.findMany({ where: { userId } }),
    );
    // Only ordBId (storeId = storeB) should be visible; ordAId must be absent.
    expect(orders.map((o) => o.id)).not.toContain(ordAId);
    expect(orders.map((o) => o.id)).toContain(ordBId);
  });

  it('store B order is NOT visible under store A context (store-scoped ORM filter)', async () => {
    const orders = await runWithTenant(
      { tenantId, storeId: storeA, isDefaultStore: false, scope: 'tenant' },
      async () => getTenantPrisma().order.findMany({ where: { userId } }),
    );
    expect(orders.map((o) => o.id)).not.toContain(ordBId);
    expect(orders.map((o) => o.id)).toContain(ordAId);
  });
});
