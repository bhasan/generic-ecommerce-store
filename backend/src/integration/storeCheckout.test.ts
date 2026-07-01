// backend/src/integration/storeCheckout.test.ts
// Task 4 — integration guard: per-store atomic stock decrement + effective pricing at checkout.
// Real DB; mirrors storeCatalog.test.ts setup pattern.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Prisma } from '../../generated/prisma';
import { getUnscopedPrisma } from '../config/database';
import { runWithTenant } from '../config/tenantContext';
import { OrderCrudService, decrementStockGuarded } from '../services/order.crud.service';
import { DeliveryMethod, PaymentMethod } from '../constants/orderMethods';

const base = getUnscopedPrisma();
const orderSvc = new OrderCrudService();

let tenantId: number;
let storeD: number; // default store
let storeS: number; // non-default store
let variantId: number;
let userId: number;

beforeAll(async () => {
  // Tenant
  const tenant = await base.tenant.create({
    data: { slug: `checkout-test-${Date.now()}`, name: 'CheckoutTest' },
  });
  tenantId = tenant.id;

  // Stores — UNSCOPED table; write with base client directly
  const d = await base.store.create({
    data: { tenantId, name: 'Default Store', slug: 'default-co', isDefault: true },
  });
  const s = await base.store.create({
    data: { tenantId, name: 'Store S', slug: 'store-s-co', isDefault: false },
  });
  storeD = d.id;
  storeS = s.id;

  // User
  const user = await base.user.create({
    data: {
      username: `checkout-u-${Date.now()}`,
      password: 'hash',
      approved: true,
      tenantId,
    },
  });
  userId = user.id;

  // Category — raw insert to bypass scoped-client requirement outside runWithTenant
  const catRows = await base.$queryRawUnsafe<Array<{ id: number }>>(
    `INSERT INTO categories (name, "tenantId", "createdAt", "updatedAt")
     VALUES ('CheckoutCat', $1, now(), now()) RETURNING id`,
    tenantId,
  );
  const catId = catRows[0].id;

  // Product
  const prodSlug = `checkout-prod-${Date.now()}`;
  const prodRows = await base.$queryRawUnsafe<Array<{ id: number }>>(
    `INSERT INTO products
       (name, slug, "categoryId", "tenantId", hidden, "vipOnly", "cardSize", "sortOrder", "createdAt", "updatedAt")
     VALUES ('CheckoutProduct', $1, $2, $3, false, false, 'STANDARD', 0, now(), now()) RETURNING id`,
    prodSlug,
    catId,
    tenantId,
  );
  const productId = prodRows[0].id;

  // Variant: basePrice=10, stock=5, stockEnabled=true
  const varRows = await base.$queryRawUnsafe<Array<{ id: number }>>(
    `INSERT INTO product_variants
       (label, sku, "pricingMode", "basePrice", stock, "stockEnabled", "isDefault", active, "sortOrder", "productId", "tenantId", "createdAt", "updatedAt")
     VALUES ('Default', $1, 'UNIT', 10, 5, true, true, true, 0, $2, $3, now(), now()) RETURNING id`,
    `checkout-v-${Date.now()}`,
    productId,
    tenantId,
  );
  variantId = varRows[0].id;

  // Store S override: stock=2, priceOverride=8
  await (base as any).storeVariantOverride.create({
    data: {
      tenantId,
      storeId: storeS,
      variantId,
      stock: new Prisma.Decimal(2),
      priceOverride: new Prisma.Decimal(8),
    },
  });
});

afterAll(async () => {
  // Remove orders (and cascade-remove order_items, payments) created during tests
  await base.$executeRawUnsafe(
    `DELETE FROM orders WHERE "tenantId" = $1`,
    tenantId,
  );
  await base.$executeRawUnsafe(
    `DELETE FROM store_variant_overrides WHERE "tenantId" = $1`,
    tenantId,
  );
  await base.$executeRawUnsafe(
    `DELETE FROM product_variants WHERE "tenantId" = $1`,
    tenantId,
  );
  await base.$executeRawUnsafe(
    `DELETE FROM products WHERE "tenantId" = $1`,
    tenantId,
  );
  await base.$executeRawUnsafe(
    `DELETE FROM categories WHERE "tenantId" = $1`,
    tenantId,
  );
  await base.$executeRawUnsafe(
    `DELETE FROM users WHERE "tenantId" = $1`,
    tenantId,
  );
  await base.store.deleteMany({ where: { tenantId } });
  await base.tenant.delete({ where: { id: tenantId } });
});

describe('checkout — per-store stock decrement + effective pricing (Task 4)', () => {
  it('NON-default store: order qty=2 succeeds, decrements override stock to 0, variant.stock unchanged, unit price=8', async () => {
    const order = await runWithTenant(
      { tenantId, storeId: storeS, isDefaultStore: false, scope: 'tenant' },
      async () =>
        orderSvc.createOrder({
          userId,
          items: [{ variantId, quantity: 2 }],
          deliveryMethod: DeliveryMethod.PICKUP,
          paymentMethod: PaymentMethod.EXTERNAL,
        }),
    );

    expect(order).toBeDefined();

    // Override stock should be 0 (decremented from 2)
    const override = await (base as any).storeVariantOverride.findFirst({
      where: { storeId: storeS, variantId },
    });
    expect(Number(override?.stock)).toBe(0);

    // variant.stock must be UNCHANGED at 5
    const variant = await base.productVariant.findUnique({ where: { id: variantId } });
    expect(Number(variant?.stock)).toBe(5);

    // Line item priced at the override price (8), not base price (10)
    const lineItem = order.items[0];
    expect(Number(lineItem.unitPrice)).toBe(8);
  });

  it('NON-default store: second order (qty=1) fails with "Insufficient stock" — override is exhausted', async () => {
    await expect(
      runWithTenant(
        { tenantId, storeId: storeS, isDefaultStore: false, scope: 'tenant' },
        async () =>
          orderSvc.createOrder({
            userId,
            items: [{ variantId, quantity: 1 }],
            deliveryMethod: DeliveryMethod.PICKUP,
            paymentMethod: PaymentMethod.EXTERNAL,
          }),
      ),
    ).rejects.toThrow('Insufficient stock');
  });

  it('DEFAULT store: order decrements variant.stock (not the override), unit price uses base price', async () => {
    const order = await runWithTenant(
      { tenantId, storeId: storeD, isDefaultStore: true, scope: 'tenant' },
      async () =>
        orderSvc.createOrder({
          userId,
          items: [{ variantId, quantity: 1 }],
          deliveryMethod: DeliveryMethod.PICKUP,
          paymentMethod: PaymentMethod.EXTERNAL,
        }),
    );

    expect(order).toBeDefined();

    // variant.stock decremented from 5 to 4
    const variant = await base.productVariant.findUnique({ where: { id: variantId } });
    expect(Number(variant?.stock)).toBe(4);

    // Override stock must be UNCHANGED at 0 (from test 1 above; not touched by default-store order)
    const override = await (base as any).storeVariantOverride.findFirst({
      where: { storeId: storeS, variantId },
    });
    expect(Number(override?.stock)).toBe(0);

    // Line item priced at the base price (10)
    const lineItem = order.items[0];
    expect(Number(lineItem.unitPrice)).toBe(10);
  });
});

// Phase-2c Finding 1 + 2 — per-store active check and base-path for no-store context.
// (a) variant with activeOverride=false at a non-default store MUST be rejected.
// (b) same variant at the default store / no-store context MUST succeed using base values.
describe('checkout — per-store active check + base-path for no-store context (Phase-2c)', () => {
  let inactiveVariantId: number;

  beforeAll(async () => {
    // Re-uses tenantId, storeD, storeS, userId from the outer beforeAll.
    const catRows = await base.$queryRawUnsafe<Array<{ id: number }>>(
      `INSERT INTO categories (name, "tenantId", "createdAt", "updatedAt")
       VALUES ('ActiveCheckCat', $1, now(), now()) RETURNING id`,
      tenantId,
    );
    const catId = catRows[0].id;

    const prodSlug = `inactive-store-prod-${Date.now()}`;
    const prodRows = await base.$queryRawUnsafe<Array<{ id: number }>>(
      `INSERT INTO products
         (name, slug, "categoryId", "tenantId", hidden, "vipOnly", "cardSize", "sortOrder", "createdAt", "updatedAt")
       VALUES ('InactiveStoreProduct', $1, $2, $3, false, false, 'STANDARD', 0, now(), now()) RETURNING id`,
      prodSlug, catId, tenantId,
    );
    const productId = prodRows[0].id;

    // Variant: basePrice=10, stock=5, stockEnabled=true, active=true (base level).
    const varRows = await base.$queryRawUnsafe<Array<{ id: number }>>(
      `INSERT INTO product_variants
         (label, sku, "pricingMode", "basePrice", stock, "stockEnabled", "isDefault", active, "sortOrder", "productId", "tenantId", "createdAt", "updatedAt")
       VALUES ('Default', $1, 'UNIT', 10, 5, true, true, true, 0, $2, $3, now(), now()) RETURNING id`,
      `inactive-store-v-${Date.now()}`, productId, tenantId,
    );
    inactiveVariantId = varRows[0].id;

    // storeS override: stock=3 (>0), activeOverride=false (hidden at this store).
    // This is the key fixture: base active=true, but hidden at storeS.
    await (base as any).storeVariantOverride.create({
      data: {
        tenantId,
        storeId: storeS,
        variantId: inactiveVariantId,
        stock: new Prisma.Decimal(3),
        priceOverride: new Prisma.Decimal(7),
        activeOverride: false,
      },
    });
  });

  // (a) FAILING before fix: createOrder does not check effective.active, so the
  // order succeeds with the override price even though the variant is hidden at storeS.
  it('(a) NON-default store: order for variant with activeOverride=false is rejected — not available at this store', async () => {
    await expect(
      runWithTenant(
        { tenantId, storeId: storeS, isDefaultStore: false, scope: 'tenant' },
        async () =>
          orderSvc.createOrder({
            userId,
            items: [{ variantId: inactiveVariantId, quantity: 1 }],
            deliveryMethod: DeliveryMethod.PICKUP,
            paymentMethod: PaymentMethod.EXTERNAL,
          }),
      ),
    ).rejects.toThrow('not available at this store');
  });

  it('(b) DEFAULT store: same variant (base active=true) succeeds and uses base price', async () => {
    const order = await runWithTenant(
      { tenantId, storeId: storeD, isDefaultStore: true, scope: 'tenant' },
      async () =>
        orderSvc.createOrder({
          userId,
          items: [{ variantId: inactiveVariantId, quantity: 1 }],
          deliveryMethod: DeliveryMethod.PICKUP,
          paymentMethod: PaymentMethod.EXTERNAL,
        }),
    );

    expect(order).toBeDefined();
    // Should use base price (10), not the storeS override price (7).
    expect(Number(order.items[0].unitPrice)).toBe(10);
  });

  // (b-nostore) FAILING before fix: decrementStockGuarded takes the OVERRIDE path when
  // isDefaultStore=false even if storeId=0 → updateMany matches no rows → "Insufficient stock".
  // storeId=0 or null represent "no real store" (default store suspended/deleted).
  // FK constraints prevent creating orders with storeId=0/null, so we call
  // decrementStockGuarded directly to isolate Finding 2's fix.
  it('(b) NO-STORE context (storeId=0, isDefaultStore=false): decrementStockGuarded uses base variant.stock path', async () => {
    const before = await base.productVariant.findUnique({ where: { id: inactiveVariantId } });
    const stockBefore = Number(before?.stock);

    // Before fix: throws "Insufficient stock" (override path with storeId=0, no row).
    // After fix: decrements variant.stock (base path).
    await base.$transaction(async (tx) => {
      await decrementStockGuarded(tx as any, inactiveVariantId, 1, 'InactiveStoreProduct', {
        storeId: 0,
        isDefaultStore: false,
      });
    });

    const after = await base.productVariant.findUnique({ where: { id: inactiveVariantId } });
    expect(Number(after?.stock)).toBe(stockBefore - 1);
  });
});

// Regression test: createOrder must scope the override lookup by storeId.
// Old code: findMany({ where: { variantId: { in: variantIds } } }) — no storeId filter.
// With two stores sharing the same variantId, both overrides are returned; last-write-wins
// in the map. If S2 (price=6) is inserted after S1 (price=8), S2 overwrites S1 in the map
// and S1's order gets priced at 6 instead of 8.
describe('cross-store override isolation — createOrder scopes override lookup by storeId (Task 4 regression)', () => {
  let storeS1: number;
  let storeS2: number;

  beforeAll(async () => {
    const s1 = await base.store.create({
      data: { tenantId, name: 'Store S1', slug: `store-s1-${Date.now()}`, isDefault: false },
    });
    const s2 = await base.store.create({
      data: { tenantId, name: 'Store S2', slug: `store-s2-${Date.now()}`, isDefault: false },
    });
    storeS1 = s1.id;
    storeS2 = s2.id;

    // S1 override created FIRST (lower DB id → returned first by Prisma) so that
    // without the storeId filter, S2's row (inserted second) overwrites S1's in the
    // map → unitPrice would be 6 instead of 8 → test fails on old code.
    await (base as any).storeVariantOverride.create({
      data: { tenantId, storeId: storeS1, variantId, stock: new Prisma.Decimal(5), priceOverride: new Prisma.Decimal(8) },
    });
    await (base as any).storeVariantOverride.create({
      data: { tenantId, storeId: storeS2, variantId, stock: new Prisma.Decimal(5), priceOverride: new Prisma.Decimal(6) },
    });
  });

  it('S1 order applies S1 price (8) not S2 price (6); S1 stock → 4, S2 stock unchanged at 5', async () => {
    const order = await runWithTenant(
      { tenantId, storeId: storeS1, isDefaultStore: false, scope: 'tenant' },
      async () =>
        orderSvc.createOrder({
          userId,
          items: [{ variantId, quantity: 1 }],
          deliveryMethod: DeliveryMethod.PICKUP,
          paymentMethod: PaymentMethod.EXTERNAL,
        }),
    );

    expect(order).toBeDefined();

    // Unit price must be S1's override price (8), not S2's (6) or base (10).
    const lineItem = order.items[0];
    expect(Number(lineItem.unitPrice)).toBe(8);

    // S1's override stock decremented: 5 → 4.
    const overrideS1 = await (base as any).storeVariantOverride.findFirst({
      where: { storeId: storeS1, variantId },
    });
    expect(Number(overrideS1?.stock)).toBe(4);

    // S2's override stock must be UNCHANGED at 5 — order was for S1, not S2.
    const overrideS2 = await (base as any).storeVariantOverride.findFirst({
      where: { storeId: storeS2, variantId },
    });
    expect(Number(overrideS2?.stock)).toBe(5);
  });
});
