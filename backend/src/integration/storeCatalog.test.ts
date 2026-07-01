// backend/src/integration/storeCatalog.test.ts
// Task 3 — integration guard: per-store effective price/stock via applyStoreOverrides.
// Real DB; mirrors tenantIsolation.test.ts setup pattern.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Prisma } from '../../generated/prisma';
import { getUnscopedPrisma } from '../config/database';
import { runWithTenant } from '../config/tenantContext';
import { ProductService } from '../services/product.service';

const base = getUnscopedPrisma();
const svc = new ProductService();

let tenantId: number;
let storeD: number; // default store
let storeS: number; // non-default store
let productId: number;
let variantV1Id: number; // has an override for store S
let variantV2Id: number; // NO override for store S

beforeAll(async () => {
  // Tenant
  const tenant = await base.tenant.create({
    data: { slug: `catalog-test-${Date.now()}`, name: 'CatalogTest' },
  });
  tenantId = tenant.id;

  // Stores — UNSCOPED table, write with base client directly
  const d = await base.store.create({
    data: { tenantId, name: 'Default Store', slug: 'default', isDefault: true },
  });
  const s = await base.store.create({
    data: { tenantId, name: 'Store S', slug: 'store-s', isDefault: false },
  });
  storeD = d.id;
  storeS = s.id;

  // Category — raw insert to bypass scoped client requirement outside runWithTenant
  const catRows = await base.$queryRawUnsafe<Array<{ id: number }>>(
    `INSERT INTO categories (name, "tenantId", "createdAt", "updatedAt")
     VALUES ('TestCat', $1, now(), now()) RETURNING id`,
    tenantId,
  );
  const catId = catRows[0].id;

  // Product
  const prodSlug = `test-prod-${Date.now()}`;
  const prodRows = await base.$queryRawUnsafe<Array<{ id: number }>>(
    `INSERT INTO products (name, slug, "categoryId", "tenantId", hidden, "vipOnly", "cardSize", "sortOrder", "createdAt", "updatedAt")
     VALUES ('Test Product', $1, $2, $3, false, false, 'STANDARD', 0, now(), now()) RETURNING id`,
    prodSlug,
    catId,
    tenantId,
  );
  productId = prodRows[0].id;

  // V1: basePrice=10, stock=5 — will have an S-override
  const v1Rows = await base.$queryRawUnsafe<Array<{ id: number }>>(
    `INSERT INTO product_variants
       (label, sku, "pricingMode", "basePrice", stock, "stockEnabled", "isDefault", active, "sortOrder", "productId", "tenantId", "createdAt", "updatedAt")
     VALUES ('V1', $1, 'UNIT', 10, 5, true, true, true, 0, $2, $3, now(), now()) RETURNING id`,
    `v1-${Date.now()}`,
    productId,
    tenantId,
  );
  variantV1Id = v1Rows[0].id;

  // V2: basePrice=20, stock=8 — no override for S → effective stock under S = 0
  const v2Rows = await base.$queryRawUnsafe<Array<{ id: number }>>(
    `INSERT INTO product_variants
       (label, sku, "pricingMode", "basePrice", stock, "stockEnabled", "isDefault", active, "sortOrder", "productId", "tenantId", "createdAt", "updatedAt")
     VALUES ('V2', $1, 'UNIT', 20, 8, true, false, true, 1, $2, $3, now(), now()) RETURNING id`,
    `v2-${Date.now()}`,
    productId,
    tenantId,
  );
  variantV2Id = v2Rows[0].id;

  // Override for store S on variant V1: stock=2, priceOverride=8
  await base.storeVariantOverride.create({
    data: {
      tenantId,
      storeId: storeS,
      variantId: variantV1Id,
      stock: new Prisma.Decimal(2),
      priceOverride: new Prisma.Decimal(8),
    },
  });
});

afterAll(async () => {
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
  await base.store.deleteMany({ where: { tenantId } });
  await base.tenant.delete({ where: { id: tenantId } });
});

describe('per-store catalog — effective price/stock (Task 3)', () => {
  it('under DEFAULT store context: V1 retains base values (basePrice=10, stock=5)', async () => {
    const products = await runWithTenant(
      { tenantId, storeId: storeD, isDefaultStore: true, scope: 'tenant' },
      async () => svc.getAllProducts(),
    );

    const v1 = products.flatMap((p) => p.variants).find((v) => v.id === variantV1Id);
    expect(v1).toBeDefined();
    expect(Number(v1!.basePrice)).toBe(10);
    expect(Number(v1!.stock)).toBe(5);
  });

  it('under NON-DEFAULT store context: V1 gets override (basePrice=8, stock=2)', async () => {
    const products = await runWithTenant(
      { tenantId, storeId: storeS, isDefaultStore: false, scope: 'tenant' },
      async () => svc.getAllProducts(),
    );

    const v1 = products.flatMap((p) => p.variants).find((v) => v.id === variantV1Id);
    expect(v1).toBeDefined();
    expect(Number(v1!.basePrice)).toBe(8);
    expect(Number(v1!.stock)).toBe(2);
  });

  it('under NON-DEFAULT store context: V2 with no override has stock=0', async () => {
    const products = await runWithTenant(
      { tenantId, storeId: storeS, isDefaultStore: false, scope: 'tenant' },
      async () => svc.getAllProducts(),
    );

    const v2 = products.flatMap((p) => p.variants).find((v) => v.id === variantV2Id);
    expect(v2).toBeDefined();
    expect(Number(v2!.stock)).toBe(0);
  });
});

describe('per-store catalog — getProductById and search paths (Task 3 review fix)', () => {
  it('getProductById: non-default store S → V1 gets override (basePrice=8, stock=2)', async () => {
    const product = await runWithTenant(
      { tenantId, storeId: storeS, isDefaultStore: false, scope: 'tenant' },
      async () => svc.getProductById(productId),
    );

    const v1 = product.variants.find((v) => v.id === variantV1Id);
    expect(v1).toBeDefined();
    expect(Number(v1!.basePrice)).toBe(8);
    expect(Number(v1!.stock)).toBe(2);
  });

  it('searchProducts (fallback): non-default store S → V1 gets override (basePrice=8, stock=2)', async () => {
    const results = await runWithTenant(
      { tenantId, storeId: storeS, isDefaultStore: false, scope: 'tenant' },
      async () => svc.searchProducts(undefined, '', { limit: 100, offset: 0 }),
    );

    const v1 = results.flatMap((p: any) => p.variants as Array<any>).find((v: any) => v.id === variantV1Id);
    expect(v1).toBeDefined();
    expect(Number(v1!.basePrice)).toBe(8);
    expect(Number(v1!.stock)).toBe(2);
  });

  it('null-storeId context (passthrough): getAllProducts returns V1 with BASE stock=5', async () => {
    const products = await runWithTenant(
      { tenantId, storeId: null, isDefaultStore: false, scope: 'tenant' },
      async () => svc.getAllProducts(),
    );

    const v1 = products.flatMap((p) => p.variants).find((v) => v.id === variantV1Id);
    expect(v1).toBeDefined();
    expect(Number(v1!.basePrice)).toBe(10);
    expect(Number(v1!.stock)).toBe(5);
  });
});
