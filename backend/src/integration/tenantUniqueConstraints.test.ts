// backend/src/integration/tenantUniqueConstraints.test.ts
//
// Proves that the tenant_scope_unique_constraints migration replaced bare single-column
// @unique constraints (which would cause cross-tenant collisions) with composite
// @@unique([tenantId, ...]) constraints. Two distinct tenants can each hold a row with
// the same previously-unique value; a second row with the same value WITHIN one tenant
// still violates the constraint as expected.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getUnscopedPrisma } from '../config/database';

const base = getUnscopedPrisma();
let tA: number, tB: number;
let catAId: number, catBId: number;

beforeAll(async () => {
  const a = await base.tenant.create({ data: { slug: `ucA-${Date.now()}`, name: 'UC Tenant A' } });
  const b = await base.tenant.create({ data: { slug: `ucB-${Date.now()}`, name: 'UC Tenant B' } });
  tA = a.id;
  tB = b.id;
});

afterAll(async () => {
  // Delete in FK-safe order: variants → products → categories → ui_settings → tenants
  await base.$executeRawUnsafe(
    `DELETE FROM product_variants WHERE "tenantId" IN ($1,$2)`, tA, tB,
  );
  await base.$executeRawUnsafe(
    `DELETE FROM products WHERE "tenantId" IN ($1,$2)`, tA, tB,
  );
  await base.$executeRawUnsafe(
    `DELETE FROM categories WHERE "tenantId" IN ($1,$2)`, tA, tB,
  );
  await base.$executeRawUnsafe(
    `DELETE FROM ui_settings WHERE "tenantId" IN ($1,$2)`, tA, tB,
  );
  await base.tenant.deleteMany({ where: { id: { in: [tA, tB] } } });
});

describe('composite-unique constraints allow cross-tenant duplicates', () => {
  it('two tenants can each hold a UiSetting with key "branding" without unique violation', async () => {
    await expect(
      base.uiSetting.create({ data: { key: 'branding', value: {}, tenantId: tA, storeId: 0 } }),
    ).resolves.toBeDefined();
    await expect(
      base.uiSetting.create({ data: { key: 'branding', value: {}, tenantId: tB, storeId: 0 } }),
    ).resolves.toBeDefined();
  });

  it('a SECOND UiSetting with the same (tenantId, storeId, key) tuple violates @@unique([tenantId, storeId, key])', async () => {
    // tA already has (storeId: 0, key: 'branding') from the previous test; a second insert must fail.
    await expect(
      base.uiSetting.create({ data: { key: 'branding', value: {}, tenantId: tA, storeId: 0 } }),
    ).rejects.toThrow();
  });

  it('allows a tenant-default (storeId 0) and a per-store override row for the same ui_settings key', async () => {
    const prisma = getUnscopedPrisma();
    const t = await prisma.tenant.create({ data: { slug: 'p2b-uisetting', name: 'P2B', status: 'ACTIVE' } });
    const s = await prisma.store.create({ data: { tenantId: t.id, name: 'S', slug: 's', status: 'ACTIVE' } });
    try {
      await prisma.uiSetting.create({ data: { tenantId: t.id, storeId: 0, key: 'store_settings', value: { name: 'D' } } });
      await prisma.uiSetting.create({ data: { tenantId: t.id, storeId: s.id, key: 'store_settings', value: { name: 'O' } } });
      // Duplicate (tenant, storeId 0, key) must be rejected.
      await expect(
        prisma.uiSetting.create({ data: { tenantId: t.id, storeId: 0, key: 'store_settings', value: {} } }),
      ).rejects.toThrow();
    } finally {
      await prisma.uiSetting.deleteMany({ where: { tenantId: t.id } });
      await prisma.store.delete({ where: { id: s.id } });
      await prisma.tenant.delete({ where: { id: t.id } });
    }
  });

  it('two tenants can each create a Category with the same name + null parent without violation', async () => {
    // @@unique([tenantId, name, parentId]) — same name per tenant is fine with null parentId
    const cA = await base.category.create({
      data: { name: 'SharedCatName', tenantId: tA },
    });
    const cB = await base.category.create({
      data: { name: 'SharedCatName', tenantId: tB },
    });
    catAId = cA.id;
    catBId = cB.id;
    expect(cA.tenantId).toBe(tA);
    expect(cB.tenantId).toBe(tB);
    expect(cA.name).toBe(cB.name); // same logical name, different tenants
  });

  it('two tenants can each create a ProductVariant with the same sku without violation', async () => {
    // @@unique([tenantId, sku]) — same SKU is fine across tenants
    const prodA = await base.product.create({
      data: {
        name: 'Test Product',
        slug: `test-prod-a-${Date.now()}`,
        categoryId: catAId,
        tenantId: tA,
      },
    });
    const prodB = await base.product.create({
      data: {
        name: 'Test Product',
        slug: `test-prod-b-${Date.now()}`,
        categoryId: catBId,
        tenantId: tB,
      },
    });

    await expect(
      base.productVariant.create({
        data: { label: 'Default', sku: 'SHARED-SKU-001', basePrice: 9.99, productId: prodA.id, tenantId: tA },
      }),
    ).resolves.toBeDefined();
    await expect(
      base.productVariant.create({
        data: { label: 'Default', sku: 'SHARED-SKU-001', basePrice: 9.99, productId: prodB.id, tenantId: tB },
      }),
    ).resolves.toBeDefined();
  });
});
