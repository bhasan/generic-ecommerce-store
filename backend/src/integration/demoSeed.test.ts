// backend/src/integration/demoSeed.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { seedDemo } from '../../prisma/seed-demo';
import { getUnscopedPrisma, getTenantPrisma } from '../config/database';
import { runWithTenant } from '../config/tenantContext';

let demoTenantId = 0, demoStoreId = 0;

beforeAll(async () => {
  const r = await seedDemo();
  demoTenantId = r.tenantId; demoStoreId = r.storeId;
});

describe('Demo tenant seed', () => {
  it('creates an isolated demo tenant with catalog and lifecycle orders', async () => {
    const products = await runWithTenant(
      { tenantId: demoTenantId, storeId: demoStoreId, scope: 'tenant' },
      () => getTenantPrisma().product.findMany(),
    );
    expect(products.length).toBe(3);

    const orders = await runWithTenant(
      { tenantId: demoTenantId, storeId: demoStoreId, scope: 'tenant' },
      () => getTenantPrisma().order.findMany(),
    );
    expect(orders.length).toBe(7);
  });

  it('does not leak demo products into the default (app) tenant', async () => {
    const base = getUnscopedPrisma();
    const appTenant = await base.tenant.findFirst({ where: { slug: 'app' } });
    // The app (default) tenant is a system invariant (verifyDefaultTenant enforces it
    // at boot). Assert it exists so this isolation test can never pass vacuously.
    expect(appTenant).not.toBeNull();
    const leaked = await runWithTenant(
      { tenantId: appTenant!.id, storeId: null, scope: 'tenant' },
      () => getTenantPrisma().product.findMany({ where: { slug: 'demo-widget' } }),
    );
    expect(leaked.length).toBe(0);
  });

  it('is idempotent — re-running keeps counts stable', async () => {
    const r = await seedDemo();
    const products = await runWithTenant(
      { tenantId: r.tenantId, storeId: r.storeId, scope: 'tenant' },
      () => getTenantPrisma().product.findMany(),
    );
    expect(products.length).toBe(3);
    const orders = await runWithTenant(
      { tenantId: r.tenantId, storeId: r.storeId, scope: 'tenant' },
      () => getTenantPrisma().order.findMany(),
    );
    expect(orders.length).toBe(7);
  });
});
