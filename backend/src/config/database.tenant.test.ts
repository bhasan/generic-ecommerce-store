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
