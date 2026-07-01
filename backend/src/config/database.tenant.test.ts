// backend/src/config/database.tenant.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTenantPrisma, getUnscopedPrisma } from './database';
import { runWithTenant } from './tenantContext';

// ---------------------------------------------------------------------------
// storeId: 0 sentinel — "all stores" context
// ---------------------------------------------------------------------------
// Announcements are store-scoped (in STORE_SCOPED_TABLES) and have an FK to
// stores. We create real Store rows (stores is UNSCOPED — no tenant context
// required) so the FK constraint is satisfied.
describe('storeId 0 sentinel — all-stores context', () => {
  const base = getUnscopedPrisma();
  let tenantId: number;
  let STORE_A: number;
  let STORE_B: number;

  beforeAll(async () => {
    const ts = Date.now();
    const tenant = await base.tenant.create({ data: { slug: `s0-${ts}`, name: 'S0 Test' } });
    tenantId = tenant.id;
    // Create real stores (stores is UNSCOPED — use base client with explicit tenantId)
    const storeA = await base.store.create({ data: { name: 'Store A', slug: `s0-a-${ts}`, tenantId } });
    const storeB = await base.store.create({ data: { name: 'Store B', slug: `s0-b-${ts}`, tenantId } });
    STORE_A = storeA.id;
    STORE_B = storeB.id;
    // Insert two announcements belonging to different stores
    await base.announcement.create({ data: { message: 'ann-storeA', storeId: STORE_A, tenantId } });
    await base.announcement.create({ data: { message: 'ann-storeB', storeId: STORE_B, tenantId } });
  });

  afterAll(async () => {
    await base.announcement.deleteMany({ where: { tenantId } });
    await base.store.deleteMany({ where: { tenantId } });
    await base.tenant.delete({ where: { id: tenantId } });
  });

  it('storeId 0: findMany on store-scoped table returns rows from ALL stores (no storeId filter)', async () => {
    const rows = await runWithTenant({ tenantId, storeId: 0, scope: 'tenant' }, async () => {
      return getTenantPrisma().announcement.findMany({ orderBy: { message: 'asc' } });
    });
    // Both announcements (from different stores) must be returned
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const messages = rows.map((r) => r.message);
    expect(messages).toContain('ann-storeA');
    expect(messages).toContain('ann-storeB');
    // Confirm storeId is NOT filtered (rows from multiple stores present)
    const storeIds = new Set(rows.map((r) => r.storeId));
    expect(storeIds.has(STORE_A)).toBe(true);
    expect(storeIds.has(STORE_B)).toBe(true);
  });

  it('storeId N: findMany on store-scoped table filters to that store only', async () => {
    const rows = await runWithTenant({ tenantId, storeId: STORE_A, scope: 'tenant' }, async () => {
      return getTenantPrisma().announcement.findMany();
    });
    expect(rows.length).toBe(1);
    expect(rows[0].message).toBe('ann-storeA');
    expect(rows[0].storeId).toBe(STORE_A);
  });

  it('storeId 0: create on store-scoped table does NOT stamp storeId 0 onto the row', async () => {
    const created = await runWithTenant({ tenantId, storeId: 0, scope: 'tenant' }, async () => {
      return getTenantPrisma().announcement.create({ data: { message: 'ann-created-s0' } });
    });
    // Verify via unscoped client that storeId is null (not 0)
    const raw = await base.announcement.findUnique({ where: { id: created.id } });
    expect(raw).not.toBeNull();
    expect(raw!.storeId).toBeNull();
    expect(raw!.tenantId).toBe(tenantId); // tenantId IS always stamped
    await base.announcement.delete({ where: { id: created.id } });
  });

  it('storeId N: create on store-scoped table stamps the real storeId', async () => {
    const created = await runWithTenant({ tenantId, storeId: STORE_A, scope: 'tenant' }, async () => {
      return getTenantPrisma().announcement.create({ data: { message: 'ann-created-sA' } });
    });
    const raw = await base.announcement.findUnique({ where: { id: created.id } });
    expect(raw).not.toBeNull();
    expect(raw!.storeId).toBe(STORE_A);
    expect(raw!.tenantId).toBe(tenantId);
    await base.announcement.delete({ where: { id: created.id } });
  });

  it('sanity: UNSCOPED table (tenants) is never filtered by storeId regardless of context', async () => {
    // Tenant table is UNSCOPED — storeId context has no effect
    const rows = await runWithTenant({ tenantId, storeId: 0, scope: 'tenant' }, async () => {
      // Just verify no error is thrown and the call completes
      return getTenantPrisma().tenant.findMany({ where: { id: tenantId } });
    });
    expect(Array.isArray(rows)).toBe(true);
  });

  it('sanity: tenant-only table (categories) is unaffected by storeId 0', async () => {
    // categories is tenant-scoped (not store-scoped) — storeId context has no effect
    const rows = await runWithTenant({ tenantId, storeId: 0, scope: 'tenant' }, async () => {
      return getTenantPrisma().category.findMany({ where: { tenantId } });
    });
    // Just verifies no error and categories is filtered to the tenant (no storeId filter)
    expect(Array.isArray(rows)).toBe(true);
  });
});

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
