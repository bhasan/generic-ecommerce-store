// backend/src/integration/tenantIsolation.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getUnscopedPrisma, getTenantPrisma } from '../config/database';
import { runWithTenant } from '../config/tenantContext';

const base = getUnscopedPrisma();
let tA: number, tB: number, catB: number;

beforeAll(async () => {
  const a = await base.tenant.create({ data: { slug: `iso-a-${Date.now()}`, name: 'A' } });
  const b = await base.tenant.create({ data: { slug: `iso-b-${Date.now()}`, name: 'B' } });
  tA = a.id; tB = b.id;
  const rows = await base.$queryRawUnsafe<Array<{ id: number }>>(
    `INSERT INTO categories (name, "tenantId", "createdAt", "updatedAt")
     VALUES ('secretB', $1, now(), now()) RETURNING id`, tB);
  catB = rows[0].id;
});

afterAll(async () => {
  await base.$executeRawUnsafe(`DELETE FROM categories WHERE "tenantId" IN ($1,$2)`, tA, tB);
  await base.tenant.deleteMany({ where: { id: { in: [tA, tB] } } });
});

describe('cross-tenant isolation (CI guardrail #2)', () => {
  it('tenant A cannot read tenant B rows via the ORM', async () => {
    const seen = await runWithTenant({ tenantId: tA, storeId: null, scope: 'tenant' }, async () =>
      await getTenantPrisma().category.findMany());
    expect(seen.find((c) => c.id === catB)).toBeUndefined();
  });

  it('tenant A cannot UPDATE tenant B rows (affects zero rows)', async () => {
    const affected = await runWithTenant({ tenantId: tA, storeId: null, scope: 'tenant' }, async () =>
      await getTenantPrisma().category.updateMany({ where: { id: catB }, data: { name: 'hacked' } }));
    expect(affected.count).toBe(0);
  });
});
