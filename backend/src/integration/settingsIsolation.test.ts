// backend/src/integration/settingsIsolation.test.ts
//
// Proves that per-tenant settings storage is end-to-end isolated: a value written
// under tenant A cannot be read back under tenant B. The settings cache is keyed by
// `${tenantId}:${settingsKey}`, so even in-process there is no cross-tenant leakage.
//
// Also proves per-store store_settings isolation: the tenant-default row (storeId 0)
// is merged with an active store's override row, so each store sees its own effective
// settings without polluting the default or other stores.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getUnscopedPrisma } from '../config/database';
import { runWithTenant } from '../config/tenantContext';
import { BrandingService } from '../services/branding.service';
import { StoreSettingsService } from '../services/storeSettings.service';
import { clearSettingsCache } from '../services/settingsStore';

const base = getUnscopedPrisma();
let tA: number, tB: number;

beforeAll(async () => {
  const a = await base.tenant.create({
    data: { slug: `si-a-${Date.now()}`, name: 'Settings Isolation A' },
  });
  const b = await base.tenant.create({
    data: { slug: `si-b-${Date.now()}`, name: 'Settings Isolation B' },
  });
  tA = a.id;
  tB = b.id;
  // Start with a clean cache so prior test runs don't bleed in.
  clearSettingsCache();
});

afterAll(async () => {
  await base.$executeRawUnsafe(
    `DELETE FROM ui_settings WHERE "tenantId" IN ($1,$2)`, tA, tB,
  );
  await base.tenant.deleteMany({ where: { id: { in: [tA, tB] } } });
  clearSettingsCache();
});

// ---------------------------------------------------------------------------
// Per-store store_settings isolation
// ---------------------------------------------------------------------------
// Tenant T has a tenant-default row (storeId 0) and a per-store override row
// (storeId S). Reading under the default store (isDefaultStore: true) fetches
// only the storeId-0 row. Reading under store S merges storeId-0 with storeId-S,
// so non-blank fields in S win and blank fields fall back to the default.
describe('per-store store_settings isolation (store-scoped)', () => {
  let tT: number;
  let storeS: number;

  beforeAll(async () => {
    const tenant = await base.tenant.create({
      data: { slug: `si-ss-${Date.now()}`, name: 'Store Settings Per-Store Isolation' },
    });
    tT = tenant.id;
    const s = await base.store.create({
      data: { tenantId: tT, name: 'Override Store', slug: 'override', isDefault: false },
    });
    storeS = s.id;

    // Write tenant-default settings directly (storeId 0 = sentinel for tenant default).
    // We bypass StoreSettingsService to avoid the address-geocoding side-effect.
    await base.uiSetting.upsert({
      where: { tenantId_storeId_key: { tenantId: tT, storeId: 0, key: 'store_settings' } },
      create: {
        tenantId: tT, storeId: 0, key: 'store_settings',
        value: { address: '1 Default Ave', phoneNumber: '555-0001' },
      },
      update: { value: { address: '1 Default Ave', phoneNumber: '555-0001' } },
    });
    clearSettingsCache();

    // Write store-S override — only address, phoneNumber intentionally omitted so it
    // must inherit from the default row on read.
    await base.uiSetting.upsert({
      where: { tenantId_storeId_key: { tenantId: tT, storeId: storeS, key: 'store_settings' } },
      create: {
        tenantId: tT, storeId: storeS, key: 'store_settings',
        value: { address: '2 Override Blvd' },
      },
      update: { value: { address: '2 Override Blvd' } },
    });
    clearSettingsCache();
  });

  afterAll(async () => {
    await base.$executeRawUnsafe(
      `DELETE FROM ui_settings WHERE "tenantId" = $1 AND key = $2`, tT, 'store_settings',
    );
    await base.store.deleteMany({ where: { tenantId: tT } });
    await base.tenant.deleteMany({ where: { id: tT } });
    clearSettingsCache();
  });

  it('default-store context reads only the tenant-default row', async () => {
    clearSettingsCache();
    const settings = await runWithTenant(
      { tenantId: tT, storeId: null, scope: 'tenant', isDefaultStore: true },
      async () => new StoreSettingsService().getStoreSettings(),
    );
    expect(settings.address).toBe('1 Default Ave');
    expect(settings.phoneNumber).toBe('555-0001');
  });

  it('non-default-store context merges the override row on top of the tenant default', async () => {
    clearSettingsCache();
    const settings = await runWithTenant(
      { tenantId: tT, storeId: storeS, scope: 'tenant', isDefaultStore: false },
      async () => new StoreSettingsService().getStoreSettings(),
    );
    // address override wins
    expect(settings.address).toBe('2 Override Blvd');
    // phoneNumber was left blank on the override → inherits the tenant-default value
    expect(settings.phoneNumber).toBe('555-0001');
  });

  it('the store-S override row does not mutate the tenant-default row', async () => {
    const defaultRow = await base.uiSetting.findFirst({
      where: { key: 'store_settings', storeId: 0, tenantId: tT },
    });
    expect((defaultRow?.value as any)?.address).toBe('1 Default Ave');
    expect((defaultRow?.value as any)?.phoneNumber).toBe('555-0001');

    const storeRow = await base.uiSetting.findFirst({
      where: { key: 'store_settings', storeId: storeS, tenantId: tT },
    });
    // The override row was written with only address — phoneNumber absent (blank → inherits on read)
    expect((storeRow?.value as any)?.address).toBe('2 Override Blvd');
    expect((storeRow?.value as any)?.phoneNumber).toBeUndefined();
  });
});

describe('per-tenant settings isolation (end-to-end)', () => {
  it('settings written under tenant A are invisible to tenant B — tenant B reads defaults', async () => {
    const DISTINCTIVE_NAME = `Tenant A Exclusive Brand ${Date.now()}`;

    // Write a distinctive storeName under tenant A.
    await runWithTenant({ tenantId: tA, storeId: null, scope: 'tenant' }, async () => {
      await new BrandingService().updateBranding({ storeName: DISTINCTIVE_NAME });
    });

    // Flush cache so tenant B cannot accidentally hit a stale entry
    // (the cache is tenant-keyed, so this is belt-and-suspenders — tenant B's
    // cache key is `${tB}:branding`, which is distinct from `${tA}:branding`).
    clearSettingsCache();

    // Read under tenant B — there is no branding row for tB, so defaults apply.
    const brandingB = await runWithTenant({ tenantId: tB, storeId: null, scope: 'tenant' }, async () => {
      return new BrandingService().getBranding();
    });

    expect(brandingB.storeName).toBe(''); // default, not the tenant A value
    expect(brandingB.storeName).not.toBe(DISTINCTIVE_NAME);

    // Sanity-check: reading back under tenant A still returns A's value.
    clearSettingsCache();
    const brandingA = await runWithTenant({ tenantId: tA, storeId: null, scope: 'tenant' }, async () => {
      return new BrandingService().getBranding();
    });
    expect(brandingA.storeName).toBe(DISTINCTIVE_NAME);
  });
});
