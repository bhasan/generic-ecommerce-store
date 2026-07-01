import { afterAll, describe, expect, it } from 'vitest';
import { getUnscopedPrisma } from '../config/database';

const prisma = getUnscopedPrisma();
const SLUG = 'p2a-userrole-test';
const created = { tenantId: 0, storeIds: [] as number[], userId: 0, roleId: 0 };

describe('UserRole multi-store uniqueness', () => {
  afterAll(async () => {
    await prisma.userRole.deleteMany({ where: { userId: created.userId } });
    if (created.userId) await prisma.user.delete({ where: { id: created.userId } }).catch(() => {});
    if (created.storeIds.length) await prisma.store.deleteMany({ where: { id: { in: created.storeIds } } });
    if (created.tenantId) await prisma.tenant.delete({ where: { id: created.tenantId } }).catch(() => {});
  });

  it('allows the same (user, role) at two stores + an all-stores (0) row, and rejects a duplicate at the same store', async () => {
    const tenant = await prisma.tenant.create({ data: { slug: SLUG, name: 'P2A', status: 'ACTIVE' } });
    created.tenantId = tenant.id;
    const s1 = await prisma.store.create({ data: { tenantId: tenant.id, name: 'S1', slug: 's1', status: 'ACTIVE' } });
    const s2 = await prisma.store.create({ data: { tenantId: tenant.id, name: 'S2', slug: 's2', status: 'ACTIVE' } });
    created.storeIds = [s1.id, s2.id];
    const user = await prisma.user.create({ data: { username: `${SLUG}-u`, password: 'x', approved: true, tenantId: tenant.id } });
    created.userId = user.id;
    const role = await prisma.role.findFirstOrThrow({ where: { name: 'EMPLOYEE' } });
    created.roleId = role.id;

    // Same (user, role) at two real stores + an all-stores (0) row — all must succeed.
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id, tenantId: tenant.id, storeId: s1.id } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id, tenantId: tenant.id, storeId: s2.id } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id, tenantId: tenant.id, storeId: 0 } });
    const rows = await prisma.userRole.findMany({ where: { userId: user.id, roleId: role.id } });
    expect(rows.map((r) => r.storeId).sort()).toEqual([0, s1.id, s2.id].sort());

    // Duplicate at the SAME store must still be rejected.
    await expect(
      prisma.userRole.create({ data: { userId: user.id, roleId: role.id, tenantId: tenant.id, storeId: s1.id } }),
    ).rejects.toThrow();
  });
});
