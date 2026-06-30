// backend/src/config/database.tenant.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTenantPrisma, getUnscopedPrisma } from './database';
import { runWithTenant } from './tenantContext';

// Integration test — requires a test Postgres with the migration applied.
describe('getTenantPrisma', () => {
  const base = getUnscopedPrisma();
  let tA: number, tB: number;

  beforeAll(async () => {
    const a = await base.tenant.create({ data: { slug: `a-${Date.now()}`, name: 'A' } });
    const b = await base.tenant.create({ data: { slug: `b-${Date.now()}`, name: 'B' } });
    tA = a.id; tB = b.id;
    // category requires tenantId; insert via raw to set context-free
    await base.$executeRawUnsafe(
      `INSERT INTO categories (name, "tenantId", "createdAt", "updatedAt") VALUES ('catA', $1, now(), now())`, tA);
    await base.$executeRawUnsafe(
      `INSERT INTO categories (name, "tenantId", "createdAt", "updatedAt") VALUES ('catB', $1, now(), now())`, tB);
  });

  afterAll(async () => {
    await base.$executeRawUnsafe(`DELETE FROM categories WHERE "tenantId" IN ($1,$2)`, tA, tB);
    await base.tenant.deleteMany({ where: { id: { in: [tA, tB] } } });
  });

  it('only sees rows for the active tenant', async () => {
    const seen = await runWithTenant({ tenantId: tA, storeId: null, scope: 'tenant' }, async () => {
      return getTenantPrisma().category.findMany();
    });
    expect(seen.every((c) => c.name === 'catA')).toBe(true);
    expect(seen.some((c) => c.name === 'catB')).toBe(false);
  });
});

// Regression test for the findUnique → findFirst redirect (#7):
// Previously the redirect dropped `include` and `select` from the args, causing
// relations to be absent even when explicitly requested. The fix spreads `...anyArgs`
// before overwriting `where`, so all other options (include, select, orderBy, etc.)
// are forwarded to the underlying findFirst call.
describe('findUnique preserves include and select through the tenant redirect', () => {
  const base = getUnscopedPrisma();
  let tenantId: number;
  let categoryId: number;
  let productId: number;
  let variantId: number;

  beforeAll(async () => {
    const ts = Date.now();
    const tenant = await base.tenant.create({ data: { slug: `fu-${ts}`, name: 'FindUnique Test' } });
    tenantId = tenant.id;

    // Create supporting data via the unscoped client (tenantId set explicitly).
    const category = await base.category.create({
      data: { name: 'FU-Cat', tenantId },
    });
    categoryId = category.id;

    const product = await base.product.create({
      data: { name: 'FU-Product', slug: `fu-prod-${ts}`, categoryId, tenantId },
    });
    productId = product.id;

    const variant = await base.productVariant.create({
      data: { productId, label: 'Default', sku: `fu-sku-${ts}`, basePrice: 9.99, tenantId },
    });
    variantId = variant.id;
  });

  afterAll(async () => {
    // Clean up in dependency order (variants → products → categories → tenant).
    await base.productVariant.deleteMany({ where: { tenantId } });
    await base.product.deleteMany({ where: { tenantId } });
    await base.category.deleteMany({ where: { tenantId } });
    await base.tenant.delete({ where: { id: tenantId } });
  });

  it('findUnique with include returns the requested relation', async () => {
    const result = await runWithTenant({ tenantId, storeId: null, scope: 'tenant' }, async () => {
      return getTenantPrisma().product.findUnique({
        where: { id: productId },
        include: { variants: true },
      });
    });

    expect(result).not.toBeNull();
    // The redirect must forward `include` — if it was dropped the array would be absent.
    expect(result!.variants).toBeDefined();
    expect(Array.isArray(result!.variants)).toBe(true);
    expect(result!.variants).toHaveLength(1);
    expect(result!.variants[0].id).toBe(variantId);
  });

  it('findUnique with select returns only the selected fields', async () => {
    const result = await runWithTenant({ tenantId, storeId: null, scope: 'tenant' }, async () => {
      return getTenantPrisma().product.findUnique({
        where: { id: productId },
        select: { id: true },
      });
    });

    expect(result).not.toBeNull();
    expect(result!.id).toBe(productId);
    // Fields not in `select` must be absent — if `select` was dropped all fields would appear.
    const keys = Object.keys(result!);
    expect(keys).toContain('id');
    expect(keys).not.toContain('name');
    expect(keys).not.toContain('slug');
    expect(keys).not.toContain('categoryId');
  });
});
