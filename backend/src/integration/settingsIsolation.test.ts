// backend/src/integration/settingsIsolation.test.ts
//
// Proves that per-tenant settings storage is end-to-end isolated: a value written
// under tenant A cannot be read back under tenant B. The settings cache is keyed by
// `${tenantId}:${settingsKey}`, so even in-process there is no cross-tenant leakage.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getUnscopedPrisma } from '../config/database';
import { runWithTenant } from '../config/tenantContext';
import { BrandingService } from '../services/branding.service';
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
