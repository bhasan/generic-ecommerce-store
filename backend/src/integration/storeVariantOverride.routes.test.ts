// backend/src/integration/storeVariantOverride.routes.test.ts
//
// Integration tests for StoreVariantOverrideService (Phase 2e Task 4).
// Drives the service directly against a real DB (no supertest).
//
// Pattern: getUnscopedPrisma() for setup/teardown; runWithTenant for service calls.
// ALWAYS await inside the runWithTenant callback (ALS context rule).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getUnscopedPrisma } from '../config/database';
import { runWithTenant } from '../config/tenantContext';
import { StoreVariantOverrideService } from '../services/storeVariantOverride.service';
import { AppError } from '../middleware/error.middleware';

const base = getUnscopedPrisma();
const svc = new StoreVariantOverrideService();

let tenantId: number;
let otherTenantId: number;
let storeId: number;
let otherStoreId: number;
let variantId: number;
let otherVariantId: number; // belongs to otherTenant

beforeAll(async () => {
  // ── Main tenant ────────────────────────────────────────────────────────────
  const tenant = await base.tenant.create({
    data: { slug: `svo-${Date.now()}`, name: 'StoreVariantOverride Test Tenant' },
  });
  tenantId = tenant.id;

  // ── Other tenant (cross-tenant rejection tests) ────────────────────────────
  const other = await base.tenant.create({
    data: { slug: `svo-other-${Date.now()}`, name: 'SVO Other Tenant' },
  });
  otherTenantId = other.id;

  // ── Store in main tenant ───────────────────────────────────────────────────
  const store = await base.store.create({
    data: { tenantId, name: 'Test Store', slug: `svo-store-${Date.now()}`, isDefault: false },
  });
  storeId = store.id;

  // ── Store in other tenant ──────────────────────────────────────────────────
  const otherStore = await base.store.create({
    data: {
      tenantId: otherTenantId,
      name: 'Other Store',
      slug: `svo-other-store-${Date.now()}`,
      isDefault: false,
    },
  });
  otherStoreId = otherStore.id;

  // ── Product + variant in main tenant ──────────────────────────────────────
  const catRows = await base.$queryRawUnsafe<Array<{ id: number }>>(
    `INSERT INTO categories (name, "tenantId", "createdAt", "updatedAt")
     VALUES ('SVOCat', $1, now(), now()) RETURNING id`,
    tenantId,
  );
  const catId = catRows[0].id;

  const prodSlug = `svo-prod-${Date.now()}`;
  const prodRows = await base.$queryRawUnsafe<Array<{ id: number }>>(
    `INSERT INTO products
       (name, slug, "categoryId", "tenantId", hidden, "vipOnly", "cardSize", "sortOrder", "createdAt", "updatedAt")
     VALUES ('SVOProduct', $1, $2, $3, false, false, 'STANDARD', 0, now(), now()) RETURNING id`,
    prodSlug, catId, tenantId,
  );
  const productId = prodRows[0].id;

  const v1Rows = await base.$queryRawUnsafe<Array<{ id: number }>>(
    `INSERT INTO product_variants
       (label, sku, "pricingMode", "basePrice", stock, "stockEnabled", "isDefault",
        active, "sortOrder", "productId", "tenantId", "createdAt", "updatedAt")
     VALUES ('V1', $1, 'UNIT', 10.00, 5, true, true, true, 0, $2, $3, now(), now()) RETURNING id`,
    `svo-v1-${Date.now()}`, productId, tenantId,
  );
  variantId = v1Rows[0].id;

  // ── Product + variant in OTHER tenant (for cross-tenant rejection) ─────────
  const otherCatRows = await base.$queryRawUnsafe<Array<{ id: number }>>(
    `INSERT INTO categories (name, "tenantId", "createdAt", "updatedAt")
     VALUES ('SVOOtherCat', $1, now(), now()) RETURNING id`,
    otherTenantId,
  );
  const otherCatId = otherCatRows[0].id;

  const otherProdSlug = `svo-other-prod-${Date.now()}`;
  const otherProdRows = await base.$queryRawUnsafe<Array<{ id: number }>>(
    `INSERT INTO products
       (name, slug, "categoryId", "tenantId", hidden, "vipOnly", "cardSize", "sortOrder", "createdAt", "updatedAt")
     VALUES ('SVOOtherProduct', $1, $2, $3, false, false, 'STANDARD', 0, now(), now()) RETURNING id`,
    otherProdSlug, otherCatId, otherTenantId,
  );
  const otherProductId = otherProdRows[0].id;

  const otherVRows = await base.$queryRawUnsafe<Array<{ id: number }>>(
    `INSERT INTO product_variants
       (label, sku, "pricingMode", "basePrice", stock, "stockEnabled", "isDefault",
        active, "sortOrder", "productId", "tenantId", "createdAt", "updatedAt")
     VALUES ('OtherV1', $1, 'UNIT', 99.00, 3, true, true, true, 0, $2, $3, now(), now()) RETURNING id`,
    `svo-other-v1-${Date.now()}`, otherProductId, otherTenantId,
  );
  otherVariantId = otherVRows[0].id;
});

afterAll(async () => {
  // Delete in FK-safe order.
  await base.$executeRawUnsafe(
    `DELETE FROM store_variant_overrides WHERE "tenantId" IN ($1,$2)`,
    tenantId, otherTenantId,
  );
  await base.$executeRawUnsafe(
    `DELETE FROM product_variants WHERE "tenantId" IN ($1,$2)`,
    tenantId, otherTenantId,
  );
  await base.$executeRawUnsafe(
    `DELETE FROM products WHERE "tenantId" IN ($1,$2)`,
    tenantId, otherTenantId,
  );
  await base.$executeRawUnsafe(
    `DELETE FROM categories WHERE "tenantId" IN ($1,$2)`,
    tenantId, otherTenantId,
  );
  await base.store.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
  await base.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } });
});

// ─────────────────────────────────────────────────────────────────────────────
// upsertOverride — happy path: create then update
// ─────────────────────────────────────────────────────────────────────────────
describe('upsertOverride — create and update', () => {
  it('creates a new override row for (storeId, variantId)', async () => {
    const result = await runWithTenant(
      { tenantId, storeId: null, scope: 'tenant' },
      async () =>
        svc.upsertOverride({
          storeId,
          variantId,
          stock: 42,
          priceOverride: 9.99,
          activeOverride: true,
        }),
    );

    expect(result.storeId).toBe(storeId);
    expect(result.variantId).toBe(variantId);
    expect(result.tenantId).toBe(tenantId);
    expect(Number(result.stock)).toBe(42);
    expect(Number(result.priceOverride)).toBeCloseTo(9.99, 2);
    expect(result.activeOverride).toBe(true);
  });

  it('updates the same row on a second upsert (no duplicate — compound-key upsert)', async () => {
    // Second upsert with different values should update the existing row.
    const result = await runWithTenant(
      { tenantId, storeId: null, scope: 'tenant' },
      async () =>
        svc.upsertOverride({
          storeId,
          variantId,
          stock: 100,
          priceOverride: 19.99,
          activeOverride: false,
        }),
    );

    expect(result.storeId).toBe(storeId);
    expect(result.variantId).toBe(variantId);
    expect(Number(result.stock)).toBe(100);
    expect(Number(result.priceOverride)).toBeCloseTo(19.99, 2);
    expect(result.activeOverride).toBe(false);

    // Verify only one row exists in the DB (compound key is unique).
    const rows = await base.storeVariantOverride.findMany({
      where: { tenantId, storeId, variantId },
    });
    expect(rows).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// listForStore — includes overrides and base variants
// ─────────────────────────────────────────────────────────────────────────────
describe('listForStore', () => {
  it('returns the override row and the tenant base variants', async () => {
    const result = await runWithTenant(
      { tenantId, storeId: null, scope: 'tenant' },
      async () => svc.listForStore(storeId),
    );

    expect(result.storeId).toBe(storeId);

    // Should include the override we upserted above.
    expect(result.overrides.length).toBeGreaterThanOrEqual(1);
    const ov = result.overrides.find((o) => o.variantId === variantId);
    expect(ov).toBeDefined();
    expect(Number(ov!.stock)).toBe(100);

    // Should include the base variant.
    expect(result.variants.length).toBeGreaterThanOrEqual(1);
    const v = result.variants.find((vr) => vr.id === variantId);
    expect(v).toBeDefined();
    expect(v!.label).toBe('V1');
    expect(v!.product).toBeDefined();
    expect(typeof v!.product.name).toBe('string');
  });

  it('returns 404 for a store that does not belong to the tenant', async () => {
    await expect(
      runWithTenant(
        { tenantId, storeId: null, scope: 'tenant' },
        async () => svc.listForStore(otherStoreId),
      ),
    ).rejects.toThrow(AppError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// storeId === 0 rejection
// ─────────────────────────────────────────────────────────────────────────────
describe('storeId === 0 guard', () => {
  it('rejects upsertOverride with storeId 0 (reserved for tenant-default settings)', async () => {
    await expect(
      runWithTenant(
        { tenantId, storeId: null, scope: 'tenant' },
        async () => svc.upsertOverride({ storeId: 0, variantId, stock: 10 }),
      ),
    ).rejects.toThrow(AppError);

    await expect(
      runWithTenant(
        { tenantId, storeId: null, scope: 'tenant' },
        async () => svc.upsertOverride({ storeId: 0, variantId, stock: 10 }),
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cross-tenant isolation
// ─────────────────────────────────────────────────────────────────────────────
describe('cross-tenant isolation', () => {
  it('rejects a variantId from another tenant (404)', async () => {
    // Attempt to upsert an override for a variant that belongs to otherTenant.
    await expect(
      runWithTenant(
        { tenantId, storeId: null, scope: 'tenant' },
        async () =>
          svc.upsertOverride({
            storeId,
            variantId: otherVariantId,
            stock: 5,
          }),
      ),
    ).rejects.toThrow(AppError);

    await expect(
      runWithTenant(
        { tenantId, storeId: null, scope: 'tenant' },
        async () =>
          svc.upsertOverride({
            storeId,
            variantId: otherVariantId,
            stock: 5,
          }),
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('rejects a storeId from another tenant (404)', async () => {
    await expect(
      runWithTenant(
        { tenantId, storeId: null, scope: 'tenant' },
        async () =>
          svc.upsertOverride({
            storeId: otherStoreId,
            variantId,
            stock: 5,
          }),
      ),
    ).rejects.toThrow(AppError);

    await expect(
      runWithTenant(
        { tenantId, storeId: null, scope: 'tenant' },
        async () =>
          svc.upsertOverride({
            storeId: otherStoreId,
            variantId,
            stock: 5,
          }),
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Validation: stock < 0 rejected
// ─────────────────────────────────────────────────────────────────────────────
describe('stock validation', () => {
  it('rejects stock < 0 with a 400 error', async () => {
    await expect(
      runWithTenant(
        { tenantId, storeId: null, scope: 'tenant' },
        async () =>
          svc.upsertOverride({
            storeId,
            variantId,
            stock: -1,
          }),
      ),
    ).rejects.toThrow(AppError);

    await expect(
      runWithTenant(
        { tenantId, storeId: null, scope: 'tenant' },
        async () =>
          svc.upsertOverride({
            storeId,
            variantId,
            stock: -1,
          }),
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('accepts stock === 0 (valid: out-of-stock)', async () => {
    const result = await runWithTenant(
      { tenantId, storeId: null, scope: 'tenant' },
      async () => svc.upsertOverride({ storeId, variantId, stock: 0 }),
    );
    expect(Number(result.stock)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// deleteOverride — removes row; deleting again is a no-op
// ─────────────────────────────────────────────────────────────────────────────
describe('deleteOverride', () => {
  it('deletes the override row and subsequent list returns no override for that variant', async () => {
    // Ensure an override exists first.
    await runWithTenant(
      { tenantId, storeId: null, scope: 'tenant' },
      async () => svc.upsertOverride({ storeId, variantId, stock: 77 }),
    );

    // Delete it.
    const del = await runWithTenant(
      { tenantId, storeId: null, scope: 'tenant' },
      async () => svc.deleteOverride(storeId, variantId),
    );
    expect(del.deleted).toBe(true);

    // Verify the row is gone from the DB.
    const rows = await base.storeVariantOverride.findMany({
      where: { tenantId, storeId, variantId },
    });
    expect(rows).toHaveLength(0);
  });

  it('deleting a nonexistent override is a harmless no-op', async () => {
    // Row was already deleted above; deleting again must not throw.
    const del = await runWithTenant(
      { tenantId, storeId: null, scope: 'tenant' },
      async () => svc.deleteOverride(storeId, variantId),
    );
    expect(del.deleted).toBe(true);
  });

  it('rejects deleteOverride for a store from another tenant (404)', async () => {
    await expect(
      runWithTenant(
        { tenantId, storeId: null, scope: 'tenant' },
        async () => svc.deleteOverride(otherStoreId, variantId),
      ),
    ).rejects.toThrow(AppError);
  });
});
