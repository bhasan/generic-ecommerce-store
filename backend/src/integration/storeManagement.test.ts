// backend/src/integration/storeManagement.test.ts
//
// Integration test for tenant-admin store management (Phase 2e Task 3).
// Drives StoreService directly against a real DB to verify:
//   - createStore: new store is ACTIVE, isDefault:false; duplicate slug rejected.
//   - updateStore: field updates; slug collision rejected; cross-tenant 404.
//   - setDefaultStore: exactly one default remains; cross-tenant 404.
//   - cloneFromDefault: SEEDS a per-store StoreVariantOverride from EVERY base ProductVariant
//                       (stock = base stock, price/active inherited via null) so the cloned
//                       store opens STOCKED + SELLABLE; storeId-0 store_settings still copied;
//                       idempotent (upsert); cross-tenant 404.
//
// Pattern: getUnscopedPrisma() for setup/teardown; runWithTenant for service calls.
// ALWAYS await inside runWithTenant callback (ALS context rule).

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { getUnscopedPrisma } from '../config/database';
import { runWithTenant } from '../config/tenantContext';
import { StoreService } from '../services/store.service';
import { resolveVariantEffective } from '../services/storeVariant.effective';
import { AppError } from '../middleware/error.middleware';

const base = getUnscopedPrisma();
const svc = new StoreService();

let tenantId: number;
let otherTenantId: number;
let defaultStoreId: number;
let targetStoreId: number;
let otherStoreId: number;
let variantId1: number;
let variantId2: number;

beforeAll(async () => {
  // ── Main test tenant ────────────────────────────────────────────────────────
  const tenant = await base.tenant.create({
    data: { slug: `smgmt-${Date.now()}`, name: 'Store Management Test Tenant' },
  });
  tenantId = tenant.id;

  // ── Other tenant (cross-tenant rejection tests) ─────────────────────────────
  const other = await base.tenant.create({
    data: { slug: `smgmt-other-${Date.now()}`, name: 'Store Mgmt Other Tenant' },
  });
  otherTenantId = other.id;

  // ── Default store for main tenant (isDefault:true) ──────────────────────────
  const defaultStore = await base.store.create({
    data: { tenantId, name: 'Default Store', slug: 'default-store', isDefault: true },
  });
  defaultStoreId = defaultStore.id;

  // ── Target store for main tenant (clone destination / update tests) ─────────
  const targetStore = await base.store.create({
    data: { tenantId, name: 'Target Store', slug: 'target-store', isDefault: false },
  });
  targetStoreId = targetStore.id;

  // ── Store in other tenant (cross-tenant guard tests) ───────────────────────
  const otherStore = await base.store.create({
    data: { tenantId: otherTenantId, name: 'Other Tenant Store', slug: 'other-store', isDefault: true },
  });
  otherStoreId = otherStore.id;

  // ── Product catalog for StoreVariantOverride seeding ──────────────────────
  const catRows = await base.$queryRawUnsafe<Array<{ id: number }>>(
    `INSERT INTO categories (name, "tenantId", "createdAt", "updatedAt")
     VALUES ('SmgmtCat', $1, now(), now()) RETURNING id`,
    tenantId,
  );
  const catId = catRows[0].id;

  const prodSlug = `smgmt-prod-${Date.now()}`;
  const prodRows = await base.$queryRawUnsafe<Array<{ id: number }>>(
    `INSERT INTO products
       (name, slug, "categoryId", "tenantId", hidden, "vipOnly", "cardSize", "sortOrder", "createdAt", "updatedAt")
     VALUES ('SmgmtProduct', $1, $2, $3, false, false, 'STANDARD', 0, now(), now()) RETURNING id`,
    prodSlug, catId, tenantId,
  );
  const productId = prodRows[0].id;

  const v1Rows = await base.$queryRawUnsafe<Array<{ id: number }>>(
    `INSERT INTO product_variants
       (label, sku, "pricingMode", "basePrice", stock, "stockEnabled", "isDefault",
        active, "sortOrder", "productId", "tenantId", "createdAt", "updatedAt")
     VALUES ('V1', $1, 'UNIT', 10, 25, true, true, true, 0, $2, $3, now(), now()) RETURNING id`,
    `smgmt-v1-${Date.now()}`, productId, tenantId,
  );
  variantId1 = v1Rows[0].id;

  const v2Rows = await base.$queryRawUnsafe<Array<{ id: number }>>(
    `INSERT INTO product_variants
       (label, sku, "pricingMode", "basePrice", stock, "stockEnabled", "isDefault",
        active, "sortOrder", "productId", "tenantId", "createdAt", "updatedAt")
     VALUES ('V2', $1, 'UNIT', 20, 8, true, false, true, 1, $2, $3, now(), now()) RETURNING id`,
    `smgmt-v2-${Date.now()}`, productId, tenantId,
  );
  variantId2 = v2Rows[0].id;
});

afterAll(async () => {
  // Delete in FK-safe order.
  await base.$executeRawUnsafe(
    `DELETE FROM store_variant_overrides WHERE "tenantId" IN ($1,$2)`,
    tenantId, otherTenantId,
  );
  await base.$executeRawUnsafe(
    `DELETE FROM ui_settings WHERE "tenantId" IN ($1,$2)`,
    tenantId, otherTenantId,
  );
  await base.$executeRawUnsafe(`DELETE FROM product_variants WHERE "tenantId" = $1`, tenantId);
  await base.$executeRawUnsafe(`DELETE FROM products WHERE "tenantId" = $1`, tenantId);
  await base.$executeRawUnsafe(`DELETE FROM categories WHERE "tenantId" = $1`, tenantId);
  await base.store.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
  await base.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } });
});

// ─────────────────────────────────────────────────────────────────────────────
// listAllStores
// ─────────────────────────────────────────────────────────────────────────────
describe('listAllStores', () => {
  let suspendedId: number;

  beforeAll(async () => {
    const s = await base.store.create({
      data: { tenantId, name: 'Suspended Store', slug: 'suspended-store', isDefault: false, status: 'SUSPENDED' },
    });
    suspendedId = s.id;
  });

  afterAll(async () => {
    if (suspendedId) await base.store.deleteMany({ where: { id: suspendedId } });
  });

  it('returns SUSPENDED stores (omitted by listStores) and includes status field, scoped to tenant', async () => {
    const all = await runWithTenant(
      { tenantId, storeId: null, scope: 'tenant' },
      async () => svc.listAllStores(),
    );
    const active = await runWithTenant(
      { tenantId, storeId: null, scope: 'tenant' },
      async () => svc.listStores(),
    );

    // listAllStores includes the suspended store; listStores does not.
    const allIds = all.map((s) => s.id);
    const activeIds = active.map((s) => s.id);
    expect(allIds).toContain(suspendedId);
    expect(activeIds).not.toContain(suspendedId);

    // Every row returned by listAllStores has a status field.
    for (const s of all) {
      expect(s).toHaveProperty('status');
    }

    // All rows are scoped to the correct tenant (no cross-tenant leakage).
    const otherAll = await runWithTenant(
      { tenantId: otherTenantId, storeId: null, scope: 'tenant' },
      async () => svc.listAllStores(),
    );
    const otherIds = otherAll.map((s) => s.id);
    for (const id of allIds) {
      expect(otherIds).not.toContain(id);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createStore
// ─────────────────────────────────────────────────────────────────────────────
describe('createStore', () => {
  let createdId: number;

  afterAll(async () => {
    // Clean up the store created by createStore tests (slug 'created-store').
    if (createdId) await base.store.deleteMany({ where: { id: createdId } });
  });

  it('creates a new store with isDefault:false and status:ACTIVE', async () => {
    const store = await runWithTenant(
      { tenantId, storeId: null, scope: 'tenant' },
      async () => svc.createStore({ name: 'Created Store', slug: 'created-store' }),
    );
    createdId = store.id;
    expect(store.isDefault).toBe(false);
    expect(store.status).toBe('ACTIVE');
    expect(store.tenantId).toBe(tenantId);
    expect(store.name).toBe('Created Store');
    expect(store.slug).toBe('created-store');
  });

  it('rejects a duplicate slug within the same tenant', async () => {
    await expect(
      runWithTenant(
        { tenantId, storeId: null, scope: 'tenant' },
        async () => svc.createStore({ name: 'Dup Store', slug: 'created-store' }),
      ),
    ).rejects.toThrow(AppError);
  });

  it('allows the same slug under a different tenant', async () => {
    // A slug used by tenant T is valid for other tenant O.
    const store = await runWithTenant(
      { tenantId: otherTenantId, storeId: null, scope: 'tenant' },
      async () => svc.createStore({ name: 'Same Slug Other Tenant', slug: 'created-store' }),
    );
    // Cleanup immediately.
    await base.store.delete({ where: { id: store.id } });
    expect(store.tenantId).toBe(otherTenantId);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// updateStore
// ─────────────────────────────────────────────────────────────────────────────
describe('updateStore', () => {
  afterEach(async () => {
    // Restore target store's name/slug after each test.
    await base.store.update({
      where: { id: targetStoreId },
      data: { name: 'Target Store', slug: 'target-store' },
    });
  });

  it('updates allowed fields (name, slug) for an owned store', async () => {
    const updated = await runWithTenant(
      { tenantId, storeId: null, scope: 'tenant' },
      async () => svc.updateStore(targetStoreId, { name: 'Renamed Store', slug: 'renamed-store' }),
    );
    expect(updated.name).toBe('Renamed Store');
    expect(updated.slug).toBe('renamed-store');
  });

  it('rejects a slug collision with another store in the same tenant', async () => {
    await expect(
      runWithTenant(
        { tenantId, storeId: null, scope: 'tenant' },
        async () => svc.updateStore(targetStoreId, { slug: 'default-store' }),
      ),
    ).rejects.toThrow(AppError);
  });

  it('returns 404 when the store does not belong to the caller tenant', async () => {
    await expect(
      runWithTenant(
        { tenantId, storeId: null, scope: 'tenant' },
        async () => svc.updateStore(otherStoreId, { name: 'Hacked' }),
      ),
    ).rejects.toThrow(AppError);
  });

  it('TOCTOU: foreign store id throws and mutates zero rows', async () => {
    // Capture the other tenant's store name before the attempt.
    const before = await base.store.findUnique({ where: { id: otherStoreId } });

    await expect(
      runWithTenant(
        { tenantId, storeId: null, scope: 'tenant' },
        async () => svc.updateStore(otherStoreId, { name: 'CrossTenantHack' }),
      ),
    ).rejects.toThrow(AppError);

    // The other tenant's store must be completely unchanged.
    const after = await base.store.findUnique({ where: { id: otherStoreId } });
    expect(after?.name).toBe(before?.name);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// setDefaultStore
// ─────────────────────────────────────────────────────────────────────────────
describe('setDefaultStore', () => {
  afterEach(async () => {
    // Restore defaultStoreId as the sole default after each test.
    await base.store.updateMany({ where: { tenantId }, data: { isDefault: false } });
    await base.store.update({ where: { id: defaultStoreId }, data: { isDefault: true } });
  });

  it('makes the target store the new default and unsets the previous default', async () => {
    await runWithTenant(
      { tenantId, storeId: null, scope: 'tenant' },
      async () => svc.setDefaultStore(targetStoreId),
    );
    const stores = await base.store.findMany({ where: { tenantId } });
    const defaults = stores.filter((s) => s.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].id).toBe(targetStoreId);

    const oldDefault = stores.find((s) => s.id === defaultStoreId);
    expect(oldDefault?.isDefault).toBe(false);
  });

  it('returns 404 when the store does not belong to the caller tenant', async () => {
    await expect(
      runWithTenant(
        { tenantId, storeId: null, scope: 'tenant' },
        async () => svc.setDefaultStore(otherStoreId),
      ),
    ).rejects.toThrow(AppError);
  });

  it('TOCTOU: foreign store id throws, tx rolls back, and caller tenant default is unchanged', async () => {
    // Confirm our tenant's default is defaultStoreId before the attempt.
    const beforeDefaults = await base.store.findMany({
      where: { tenantId, isDefault: true },
    });
    expect(beforeDefaults).toHaveLength(1);
    expect(beforeDefaults[0].id).toBe(defaultStoreId);

    await expect(
      runWithTenant(
        { tenantId, storeId: null, scope: 'tenant' },
        async () => svc.setDefaultStore(otherStoreId),
      ),
    ).rejects.toThrow(AppError);

    // The caller tenant's default must remain unchanged — the tx must not have
    // blanked it out before failing on the final updateMany.
    const afterDefaults = await base.store.findMany({
      where: { tenantId, isDefault: true },
    });
    expect(afterDefaults).toHaveLength(1);
    expect(afterDefaults[0].id).toBe(defaultStoreId);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase-2 fix: keep an ACTIVE default store per tenant so resolveActiveStore
// never returns null (which would make store-scoped checkout creates fail closed).
// ─────────────────────────────────────────────────────────────────────────────
describe('setDefaultStore status guard', () => {
  let suspendedStoreId: number;

  beforeAll(async () => {
    const s = await base.store.create({
      data: {
        tenantId,
        name: 'Suspended For Default',
        slug: 'suspended-for-default',
        isDefault: false,
        status: 'SUSPENDED',
      },
    });
    suspendedStoreId = s.id;
  });

  afterAll(async () => {
    if (suspendedStoreId) await base.store.deleteMany({ where: { id: suspendedStoreId } });
    // Restore defaultStoreId as the sole default.
    await base.store.updateMany({ where: { tenantId }, data: { isDefault: false } });
    await base.store.update({ where: { id: defaultStoreId }, data: { isDefault: true } });
  });

  it('rejects setting a SUSPENDED store as the default', async () => {
    await expect(
      runWithTenant(
        { tenantId, storeId: null, scope: 'tenant' },
        async () => svc.setDefaultStore(suspendedStoreId),
      ),
    ).rejects.toThrow(/suspended/i);

    // The default must be unchanged (still exactly one, still defaultStoreId).
    const defaults = await base.store.findMany({ where: { tenantId, isDefault: true } });
    expect(defaults).toHaveLength(1);
    expect(defaults[0].id).toBe(defaultStoreId);
  });

  it('still sets an ACTIVE store as the default', async () => {
    const updated = await runWithTenant(
      { tenantId, storeId: null, scope: 'tenant' },
      async () => svc.setDefaultStore(targetStoreId),
    );
    expect(updated.isDefault).toBe(true);

    const defaults = await base.store.findMany({ where: { tenantId, isDefault: true } });
    expect(defaults).toHaveLength(1);
    expect(defaults[0].id).toBe(targetStoreId);

    // Restore defaultStoreId as the sole default.
    await base.store.updateMany({ where: { tenantId }, data: { isDefault: false } });
    await base.store.update({ where: { id: defaultStoreId }, data: { isDefault: true } });
  });
});

describe('updateStore status guard', () => {
  beforeAll(async () => {
    // Ensure defaultStoreId is the ACTIVE default before these tests.
    await base.store.updateMany({ where: { tenantId }, data: { isDefault: false } });
    await base.store.update({ where: { id: defaultStoreId }, data: { isDefault: true, status: 'ACTIVE' } });
  });

  afterEach(async () => {
    // Restore statuses / default flag after each test.
    await base.store.update({ where: { id: defaultStoreId }, data: { status: 'ACTIVE', isDefault: true } });
    await base.store.update({ where: { id: targetStoreId }, data: { status: 'ACTIVE' } });
  });

  it('rejects suspending the store that is the current default', async () => {
    await expect(
      runWithTenant(
        { tenantId, storeId: null, scope: 'tenant' },
        async () => svc.updateStore(defaultStoreId, { status: 'SUSPENDED' }),
      ),
    ).rejects.toThrow(/default/i);

    // The default store must remain ACTIVE.
    const store = await base.store.findUnique({ where: { id: defaultStoreId } });
    expect(store?.status).toBe('ACTIVE');
  });

  it('allows suspending a non-default store', async () => {
    const updated = await runWithTenant(
      { tenantId, storeId: null, scope: 'tenant' },
      async () => svc.updateStore(targetStoreId, { status: 'SUSPENDED' }),
    );
    expect(updated.status).toBe('SUSPENDED');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// cloneFromDefault
// ─────────────────────────────────────────────────────────────────────────────
describe('cloneFromDefault', () => {
  beforeAll(async () => {
    // Ensure defaultStoreId is the current default.
    await base.store.updateMany({ where: { tenantId }, data: { isDefault: false } });
    await base.store.update({ where: { id: defaultStoreId }, data: { isDefault: true } });

    // New behavior seeds from the BASE catalog, NOT from the default store's
    // override rows — so the realistic scenario is a default store with NO
    // overrides. Start from a clean slate to prove the seed reads base variants.
    await base.storeVariantOverride.deleteMany({ where: { tenantId } });

    // Seed storeId=0 store_settings row (tenant-default settings) — still copied.
    await base.uiSetting.upsert({
      where: { tenantId_storeId_key: { tenantId, storeId: 0, key: 'store_settings' } },
      create: {
        tenantId, storeId: 0, key: 'store_settings',
        value: { address: '1 Default St', phoneNumber: '555-1234' },
      },
      update: { value: { address: '1 Default St', phoneNumber: '555-1234' } },
    });
  });

  it('seeds a StoreVariantOverride from every base variant (stocked + price-inherited) and copies store_settings', async () => {
    const result = await runWithTenant(
      { tenantId, storeId: null, scope: 'tenant' },
      async () => svc.cloneFromDefault(targetStoreId),
    );

    // One override seeded per base ProductVariant in the tenant (V1, V2).
    expect(result.overridesCopied).toBe(2);
    expect(result.settingsCopied).toBe(1);

    // ── Verify the seeded override for V1 carries the BASE stock, null price,
    //    null active (inherit) so the store opens with its own stock pool. ────
    const v1Override = await base.storeVariantOverride.findUnique({
      where: { storeId_variantId: { storeId: targetStoreId, variantId: variantId1 } },
    });
    expect(v1Override).toBeDefined();
    expect(Number(v1Override!.stock)).toBe(25); // base variant.stock, now the store's pool
    expect(v1Override!.priceOverride).toBeNull(); // inherit base price + price breaks (not flat)
    expect(v1Override!.activeOverride).toBeNull(); // inherit base active

    // ── The cloned (NON-default) store must be SELLABLE via the effective
    //    resolver: base stock, inherited base price, available in stock. ──────
    const variant = await base.productVariant.findUnique({ where: { id: variantId1 } });
    const effective = resolveVariantEffective(
      {
        basePrice: variant!.basePrice,
        stock: variant!.stock,
        stockEnabled: variant!.stockEnabled,
        active: variant!.active,
      },
      v1Override!,
      false, // isDefaultStore — a cloned non-default store used to show 0 stock
    );
    expect(effective.stock).toBe(25);
    expect(effective.price).toBe(Number(variant!.basePrice)); // inherited base price
    expect(effective.priceOverridden).toBe(false); // null price → breaks still apply
    expect(effective.available).toBe(true); // in stock → sellable

    // ── store_settings row copied from the storeId-0 sentinel to the target ──
    const settings = await base.uiSetting.findFirst({
      where: { tenantId, storeId: targetStoreId, key: 'store_settings' },
    });
    expect(settings).toBeDefined();
    expect((settings!.value as Record<string, unknown>).address).toBe('1 Default St');
    expect((settings!.value as Record<string, unknown>).phoneNumber).toBe('555-1234');
  });

  it('is idempotent: re-cloning upserts without duplicating rows and keeps base stock', async () => {
    const result = await runWithTenant(
      { tenantId, storeId: null, scope: 'tenant' },
      async () => svc.cloneFromDefault(targetStoreId),
    );
    expect(result.overridesCopied).toBe(2);

    // No duplicate rows: exactly one override per variant for the target store.
    const overrides = await base.storeVariantOverride.findMany({
      where: { storeId: targetStoreId },
    });
    expect(overrides).toHaveLength(2);

    const v1Override = overrides.find((o) => o.variantId === variantId1);
    expect(Number(v1Override!.stock)).toBe(25); // upsert kept base stock
    expect(v1Override!.priceOverride).toBeNull();
  });

  it('returns 404 when the target store does not belong to the caller tenant', async () => {
    await expect(
      runWithTenant(
        { tenantId, storeId: null, scope: 'tenant' },
        async () => svc.cloneFromDefault(otherStoreId),
      ),
    ).rejects.toThrow(AppError);
  });

  it('returns an error when no default store is configured', async () => {
    // Temporarily unset all defaults.
    await base.store.updateMany({ where: { tenantId }, data: { isDefault: false } });
    try {
      await expect(
        runWithTenant(
          { tenantId, storeId: null, scope: 'tenant' },
          async () => svc.cloneFromDefault(targetStoreId),
        ),
      ).rejects.toThrow(AppError);
    } finally {
      // Restore the default.
      await base.store.update({ where: { id: defaultStoreId }, data: { isDefault: true } });
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// cloneFromDefault — parallelized per-variant upsert (perf fix regression)
//
// cloneFromDefault batches its N StoreVariantOverride upserts via Promise.all
// instead of a sequential for-loop. The risk of a naive parallelization is
// dropped rows or cross-contaminated values (e.g. a shared/mutated closure
// variable scrambling which stock goes with which variantId). Use a dedicated
// tenant with 5 variants (across 2 products) each with a DISTINCT stock value,
// so any row mixup or drop is immediately visible.
// ─────────────────────────────────────────────────────────────────────────────
describe('cloneFromDefault — parallel upsert of many variants', () => {
  let mvTenantId: number;
  let mvDefaultStoreId: number;
  let mvTargetStoreId: number;
  const mvVariants: Array<{ id: number; stock: number }> = [];

  beforeAll(async () => {
    const tenant = await base.tenant.create({
      data: { slug: `smgmt-mv-${Date.now()}`, name: 'Store Mgmt Multi-Variant Tenant' },
    });
    mvTenantId = tenant.id;

    const defaultStore = await base.store.create({
      data: { tenantId: mvTenantId, name: 'MV Default Store', slug: 'mv-default-store', isDefault: true },
    });
    mvDefaultStoreId = defaultStore.id;

    const target = await base.store.create({
      data: { tenantId: mvTenantId, name: 'MV Target Store', slug: 'mv-target-store', isDefault: false },
    });
    mvTargetStoreId = target.id;

    const catRows = await base.$queryRawUnsafe<Array<{ id: number }>>(
      `INSERT INTO categories (name, "tenantId", "createdAt", "updatedAt")
       VALUES ('SmgmtMvCat', $1, now(), now()) RETURNING id`,
      mvTenantId,
    );
    const catId = catRows[0].id;

    // Two products, so overrides span more than a single product's variants.
    const prodASlug = `smgmt-mv-prod-a-${Date.now()}`;
    const prodARows = await base.$queryRawUnsafe<Array<{ id: number }>>(
      `INSERT INTO products
         (name, slug, "categoryId", "tenantId", hidden, "vipOnly", "cardSize", "sortOrder", "createdAt", "updatedAt")
       VALUES ('SmgmtMvProductA', $1, $2, $3, false, false, 'STANDARD', 0, now(), now()) RETURNING id`,
      prodASlug, catId, mvTenantId,
    );
    const productAId = prodARows[0].id;

    const prodBSlug = `smgmt-mv-prod-b-${Date.now()}`;
    const prodBRows = await base.$queryRawUnsafe<Array<{ id: number }>>(
      `INSERT INTO products
         (name, slug, "categoryId", "tenantId", hidden, "vipOnly", "cardSize", "sortOrder", "createdAt", "updatedAt")
       VALUES ('SmgmtMvProductB', $1, $2, $3, false, false, 'STANDARD', 1, now(), now()) RETURNING id`,
      prodBSlug, catId, mvTenantId,
    );
    const productBId = prodBRows[0].id;

    // 5 variants across the two products, each with a DISTINCT stock value
    // (11, 22, 33, 44, 55) so a scrambled/dropped row is unmistakable.
    const variantDefs = [
      { label: 'MV1', stock: 11, productId: productAId, isDefault: true, sort: 0 },
      { label: 'MV2', stock: 22, productId: productAId, isDefault: false, sort: 1 },
      { label: 'MV3', stock: 33, productId: productAId, isDefault: false, sort: 2 },
      { label: 'MV4', stock: 44, productId: productBId, isDefault: true, sort: 0 },
      { label: 'MV5', stock: 55, productId: productBId, isDefault: false, sort: 1 },
    ];

    for (const def of variantDefs) {
      const rows = await base.$queryRawUnsafe<Array<{ id: number }>>(
        `INSERT INTO product_variants
           (label, sku, "pricingMode", "basePrice", stock, "stockEnabled", "isDefault",
            active, "sortOrder", "productId", "tenantId", "createdAt", "updatedAt")
         VALUES ($1, $2, 'UNIT', 10, $3, true, $4, true, $5, $6, $7, now(), now()) RETURNING id`,
        def.label, `smgmt-${def.label.toLowerCase()}-${Date.now()}-${def.sort}`, def.stock,
        def.isDefault, def.sort, def.productId, mvTenantId,
      );
      mvVariants.push({ id: rows[0].id, stock: def.stock });
    }
  });

  afterAll(async () => {
    await base.$executeRawUnsafe(`DELETE FROM store_variant_overrides WHERE "tenantId" = $1`, mvTenantId);
    await base.$executeRawUnsafe(`DELETE FROM ui_settings WHERE "tenantId" = $1`, mvTenantId);
    await base.$executeRawUnsafe(`DELETE FROM product_variants WHERE "tenantId" = $1`, mvTenantId);
    await base.$executeRawUnsafe(`DELETE FROM products WHERE "tenantId" = $1`, mvTenantId);
    await base.$executeRawUnsafe(`DELETE FROM categories WHERE "tenantId" = $1`, mvTenantId);
    await base.store.deleteMany({ where: { tenantId: mvTenantId } });
    await base.tenant.deleteMany({ where: { id: mvTenantId } });
  });

  it('creates a StoreVariantOverride for EVERY variant with the correct base stock (no dropped/corrupted rows)', async () => {
    const result = await runWithTenant(
      { tenantId: mvTenantId, storeId: null, scope: 'tenant' },
      async () => svc.cloneFromDefault(mvTargetStoreId),
    );
    expect(result.overridesCopied).toBe(mvVariants.length);

    const overrides = await base.storeVariantOverride.findMany({
      where: { storeId: mvTargetStoreId },
    });
    expect(overrides).toHaveLength(mvVariants.length);

    // Every variant must have exactly one override, carrying ITS OWN base
    // stock — not a neighbor's (which is the failure mode of a broken
    // parallelization that shares/mutates a closure variable).
    for (const v of mvVariants) {
      const o = overrides.find((row) => row.variantId === v.id);
      expect(o).toBeDefined();
      expect(Number(o!.stock)).toBe(v.stock);
      expect(o!.priceOverride).toBeNull();
      expect(o!.activeOverride).toBeNull();
    }
  });

  it('is idempotent under the parallelized upsert: re-cloning keeps exactly one row per variant with base stock', async () => {
    const result = await runWithTenant(
      { tenantId: mvTenantId, storeId: null, scope: 'tenant' },
      async () => svc.cloneFromDefault(mvTargetStoreId),
    );
    expect(result.overridesCopied).toBe(mvVariants.length);

    const overrides = await base.storeVariantOverride.findMany({
      where: { storeId: mvTargetStoreId },
    });
    expect(overrides).toHaveLength(mvVariants.length);

    for (const v of mvVariants) {
      const o = overrides.find((row) => row.variantId === v.id);
      expect(Number(o!.stock)).toBe(v.stock);
    }
  });
});
