// backend/src/integration/storeManagement.test.ts
//
// Integration test for tenant-admin store management (Phase 2e Task 3).
// Drives StoreService directly against a real DB to verify:
//   - createStore: new store is ACTIVE, isDefault:false; duplicate slug rejected.
//   - updateStore: field updates; slug collision rejected; cross-tenant 404.
//   - setDefaultStore: exactly one default remains; cross-tenant 404.
//   - cloneFromDefault: StoreVariantOverride rows + storeId-0 store_settings copied to target;
//                       idempotent (upsert); cross-tenant 404.
//
// Pattern: getUnscopedPrisma() for setup/teardown; runWithTenant for service calls.
// ALWAYS await inside runWithTenant callback (ALS context rule).

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { Prisma } from '../../generated/prisma';
import { getUnscopedPrisma } from '../config/database';
import { runWithTenant } from '../config/tenantContext';
import { StoreService } from '../services/store.service';
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
     VALUES ('V1', $1, 'UNIT', 10, 5, true, true, true, 0, $2, $3, now(), now()) RETURNING id`,
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
// cloneFromDefault
// ─────────────────────────────────────────────────────────────────────────────
describe('cloneFromDefault', () => {
  beforeAll(async () => {
    // Ensure defaultStoreId is the current default.
    await base.store.updateMany({ where: { tenantId }, data: { isDefault: false } });
    await base.store.update({ where: { id: defaultStoreId }, data: { isDefault: true } });

    // Seed 2 StoreVariantOverride rows on the default store.
    await base.storeVariantOverride.upsert({
      where: { storeId_variantId: { storeId: defaultStoreId, variantId: variantId1 } },
      create: {
        tenantId, storeId: defaultStoreId, variantId: variantId1,
        stock: new Prisma.Decimal(50),
        priceOverride: new Prisma.Decimal('9.99'),
        activeOverride: true,
      },
      update: {
        stock: new Prisma.Decimal(50),
        priceOverride: new Prisma.Decimal('9.99'),
        activeOverride: true,
      },
    });
    await base.storeVariantOverride.upsert({
      where: { storeId_variantId: { storeId: defaultStoreId, variantId: variantId2 } },
      create: {
        tenantId, storeId: defaultStoreId, variantId: variantId2,
        stock: new Prisma.Decimal(30),
        priceOverride: new Prisma.Decimal('19.99'),
        activeOverride: false,
      },
      update: {
        stock: new Prisma.Decimal(30),
        priceOverride: new Prisma.Decimal('19.99'),
        activeOverride: false,
      },
    });

    // Seed storeId=0 store_settings row (tenant-default settings).
    await base.uiSetting.upsert({
      where: { tenantId_storeId_key: { tenantId, storeId: 0, key: 'store_settings' } },
      create: {
        tenantId, storeId: 0, key: 'store_settings',
        value: { address: '1 Default St', phoneNumber: '555-1234' },
      },
      update: { value: { address: '1 Default St', phoneNumber: '555-1234' } },
    });
  });

  it('copies 2 StoreVariantOverride rows and 1 store_settings row from default to target', async () => {
    const result = await runWithTenant(
      { tenantId, storeId: null, scope: 'tenant' },
      async () => svc.cloneFromDefault(targetStoreId),
    );

    expect(result.overridesCopied).toBe(2);
    expect(result.settingsCopied).toBe(1);

    // ── Verify StoreVariantOverride rows on the target store ─────────────────
    const overrides = await base.storeVariantOverride.findMany({
      where: { storeId: targetStoreId },
      orderBy: { variantId: 'asc' },
    });
    expect(overrides).toHaveLength(2);

    const v1Override = overrides.find((o) => o.variantId === variantId1);
    expect(v1Override).toBeDefined();
    expect(Number(v1Override!.stock)).toBe(50);
    expect(Number(v1Override!.priceOverride)).toBeCloseTo(9.99, 2);
    expect(v1Override!.activeOverride).toBe(true);

    const v2Override = overrides.find((o) => o.variantId === variantId2);
    expect(v2Override).toBeDefined();
    expect(Number(v2Override!.stock)).toBe(30);
    expect(Number(v2Override!.priceOverride)).toBeCloseTo(19.99, 2);
    expect(v2Override!.activeOverride).toBe(false);

    // ── Verify store_settings row on the target store ─────────────────────────
    const settings = await base.uiSetting.findFirst({
      where: { tenantId, storeId: targetStoreId, key: 'store_settings' },
    });
    expect(settings).toBeDefined();
    expect((settings!.value as Record<string, unknown>).address).toBe('1 Default St');
    expect((settings!.value as Record<string, unknown>).phoneNumber).toBe('555-1234');
  });

  it('is idempotent: cloning again upserts without error', async () => {
    const result = await runWithTenant(
      { tenantId, storeId: null, scope: 'tenant' },
      async () => svc.cloneFromDefault(targetStoreId),
    );
    expect(result.overridesCopied).toBe(2);
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
