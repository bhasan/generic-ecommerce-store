import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getUnscopedPrisma } from '../config/database';

const prisma = getUnscopedPrisma();
const SLUG = 'p2-admin-backfill-test';

// Exact UPDATE from migration 20260701030000_userrole_admin_allstores_backfill.
// Executing it here via $executeRawUnsafe is durable proof the migration SQL
// promotes only pre-Phase-2 pinned-admin rows and leaves everything else alone.
const BACKFILL_SQL = `
UPDATE "user_roles" ur
SET "storeId" = 0
FROM "stores" s
WHERE ur."storeId" = s."id"
  AND s."isDefault" = true
  AND s."tenantId" = ur."tenantId"
  AND ur."roleId" IN (SELECT "id" FROM "roles" WHERE "name" = 'ADMIN');
`;

const created = {
  tenantId: 0,
  storeIds: [] as number[],
  userIds: [] as number[],
};
const rowIds = { adminAtDefault: 0, adminAtNonDefault: 0, staffAtDefault: 0 };

describe('Migration: backfill pre-Phase-2 tenant-admin roles to all-stores sentinel', () => {
  beforeAll(async () => {
    const tenant = await prisma.tenant.create({ data: { slug: SLUG, name: 'P2 Admin Backfill', status: 'ACTIVE' } });
    created.tenantId = tenant.id;

    const defaultStore = await prisma.store.create({
      data: { tenantId: tenant.id, name: 'Main', slug: 'main', isDefault: true, status: 'ACTIVE' },
    });
    const otherStore = await prisma.store.create({
      data: { tenantId: tenant.id, name: 'Second', slug: 'second', isDefault: false, status: 'ACTIVE' },
    });
    created.storeIds = [defaultStore.id, otherStore.id];

    const adminRole =
      (await prisma.role.findFirst({ where: { name: 'ADMIN' } })) ??
      (await prisma.role.create({ data: { name: 'ADMIN' } }));
    const staffRole =
      (await prisma.role.findFirst({ where: { name: 'EMPLOYEE' } })) ??
      (await prisma.role.create({ data: { name: 'EMPLOYEE' } }));

    const adminUser = await prisma.user.create({
      data: { username: `${SLUG}-admin`, password: 'x', approved: true, tenantId: tenant.id },
    });
    const staffUser = await prisma.user.create({
      data: { username: `${SLUG}-staff`, password: 'x', approved: true, tenantId: tenant.id },
    });
    created.userIds = [adminUser.id, staffUser.id];

    // 1. Affected row: pre-Phase-2 ADMIN pinned to the tenant's REAL default store -> must flip to 0.
    const adminAtDefault = await prisma.userRole.create({
      data: { userId: adminUser.id, roleId: adminRole.id, tenantId: tenant.id, storeId: defaultStore.id },
    });
    // 2. Control: ADMIN at a NON-default store -> must be untouched.
    const adminAtNonDefault = await prisma.userRole.create({
      data: { userId: adminUser.id, roleId: adminRole.id, tenantId: tenant.id, storeId: otherStore.id },
    });
    // 3. Control: genuinely store-scoped non-admin staff at the default store -> must be untouched.
    const staffAtDefault = await prisma.userRole.create({
      data: { userId: staffUser.id, roleId: staffRole.id, tenantId: tenant.id, storeId: defaultStore.id },
    });
    rowIds.adminAtDefault = adminAtDefault.id;
    rowIds.adminAtNonDefault = adminAtNonDefault.id;
    rowIds.staffAtDefault = staffAtDefault.id;
  });

  afterAll(async () => {
    if (created.userIds.length) {
      await prisma.userRole.deleteMany({ where: { userId: { in: created.userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: created.userIds } } });
    }
    if (created.storeIds.length) await prisma.store.deleteMany({ where: { id: { in: created.storeIds } } });
    if (created.tenantId) await prisma.tenant.delete({ where: { id: created.tenantId } }).catch(() => {});
  });

  it('promotes only the pinned-admin-at-default row to storeId 0 and leaves controls untouched', async () => {
    const [defaultStoreId, otherStoreId] = created.storeIds;

    // Sanity: the affected row starts pinned to the real default store id (not 0).
    const before = await prisma.userRole.findUniqueOrThrow({ where: { id: rowIds.adminAtDefault } });
    expect(before.storeId).toBe(defaultStoreId);

    await prisma.$executeRawUnsafe(BACKFILL_SQL);

    const adminAtDefault = await prisma.userRole.findUniqueOrThrow({ where: { id: rowIds.adminAtDefault } });
    const adminAtNonDefault = await prisma.userRole.findUniqueOrThrow({ where: { id: rowIds.adminAtNonDefault } });
    const staffAtDefault = await prisma.userRole.findUniqueOrThrow({ where: { id: rowIds.staffAtDefault } });

    // Affected: pinned admin -> all-stores sentinel.
    expect(adminAtDefault.storeId).toBe(0);
    // Untouched: admin at a non-default store keeps its real store id.
    expect(adminAtNonDefault.storeId).toBe(otherStoreId);
    // Untouched: legitimately store-scoped staff keeps its real store id (no privilege escalation).
    expect(staffAtDefault.storeId).toBe(defaultStoreId);
  });

  it('is idempotent — re-running the backfill is a no-op once the row is at 0', async () => {
    await prisma.$executeRawUnsafe(BACKFILL_SQL);
    const adminAtDefault = await prisma.userRole.findUniqueOrThrow({ where: { id: rowIds.adminAtDefault } });
    expect(adminAtDefault.storeId).toBe(0);
  });
});
