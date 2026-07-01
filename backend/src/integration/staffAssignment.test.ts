// backend/src/integration/staffAssignment.test.ts
//
// Integration tests for Phase 2e Task 5: Staff ↔ Store Assignment.
// Drives staffAssignment.service directly against a real DB.
//
// Pattern: getUnscopedPrisma() for setup/teardown; runWithTenant for service
// calls. ALWAYS await inside runWithTenant callback (ALS context rule).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getUnscopedPrisma } from '../config/database';
import { runWithTenant } from '../config/tenantContext';
import { setUserRoleAssignments, getUserRoleAssignments } from '../services/staffAssignment.service';
import { AppError } from '../middleware/error.middleware';

const base = getUnscopedPrisma();

// IDs allocated in beforeAll
let tenantId: number;
let otherTenantId: number;
let s1Id: number;
let s2Id: number;
let otherStoreId: number;
let userId: number;
let otherUserId: number; // user belonging to otherTenant
let employeeRoleId: number;
let managementRoleId: number;

beforeAll(async () => {
  // ── Main tenant ──────────────────────────────────────────────────────────────
  const tenant = await base.tenant.create({
    data: { slug: `sa-test-${Date.now()}`, name: 'Staff Assignment Test Tenant' },
  });
  tenantId = tenant.id;

  // ── Other tenant (cross-tenant rejection tests) ──────────────────────────────
  const other = await base.tenant.create({
    data: { slug: `sa-other-${Date.now()}`, name: 'Staff Assignment Other Tenant' },
  });
  otherTenantId = other.id;

  // ── Stores ───────────────────────────────────────────────────────────────────
  const store1 = await base.store.create({
    data: { tenantId, name: 'Store 1', slug: `sa-s1-${Date.now()}`, status: 'ACTIVE' },
  });
  s1Id = store1.id;

  const store2 = await base.store.create({
    data: { tenantId, name: 'Store 2', slug: `sa-s2-${Date.now()}`, status: 'ACTIVE' },
  });
  s2Id = store2.id;

  const otherStore = await base.store.create({
    data: { tenantId: otherTenantId, name: 'Other Store', slug: `sa-os-${Date.now()}`, status: 'ACTIVE' },
  });
  otherStoreId = otherStore.id;

  // ── Users ────────────────────────────────────────────────────────────────────
  const user = await base.user.create({
    data: { username: `sa-user-${Date.now()}`, password: 'x', approved: true, tenantId },
  });
  userId = user.id;

  const otherUser = await base.user.create({
    data: { username: `sa-other-user-${Date.now()}`, password: 'x', approved: true, tenantId: otherTenantId },
  });
  otherUserId = otherUser.id;

  // ── Roles (global table) ─────────────────────────────────────────────────────
  const empRole = await base.role.findFirstOrThrow({ where: { name: 'EMPLOYEE' } });
  employeeRoleId = empRole.id;

  const mgmtRole = await base.role.findFirstOrThrow({ where: { name: 'MANAGEMENT' } });
  managementRoleId = mgmtRole.id;
});

afterAll(async () => {
  // Clean up in FK-safe order
  await base.userRole.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
  await base.user.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
  await base.store.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
  await base.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } });
});

// Helper: clear user_roles for our test user between tests
async function clearUserRoles() {
  await base.userRole.deleteMany({ where: { userId, tenantId } });
}

// ─────────────────────────────────────────────────────────────────────────────
// Core assignment behaviour
// ─────────────────────────────────────────────────────────────────────────────

describe('setUserRoleAssignments — core', () => {
  it('assigns EMPLOYEE at [S1, S2] → exactly two UserRole rows', async () => {
    await clearUserRoles();

    await runWithTenant({ tenantId, storeId: null, scope: 'tenant' }, async () => {
      await setUserRoleAssignments(userId, [
        { roleName: 'EMPLOYEE', storeIds: [s1Id, s2Id] },
      ]);
    });

    const rows = await base.userRole.findMany({
      where: { userId, roleId: employeeRoleId, tenantId },
    });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.storeId).sort()).toEqual([s1Id, s2Id].sort());
  });

  it('reassigns the same role to "all" → single storeId:0 row, old rows gone', async () => {
    // Precondition: user already has EMPLOYEE at S1, S2 from the previous test,
    // but we re-seed explicitly to make this test independent.
    await clearUserRoles();
    await base.userRole.createMany({
      data: [
        { userId, roleId: employeeRoleId, tenantId, storeId: s1Id },
        { userId, roleId: employeeRoleId, tenantId, storeId: s2Id },
      ],
    });

    await runWithTenant({ tenantId, storeId: null, scope: 'tenant' }, async () => {
      await setUserRoleAssignments(userId, [
        { roleName: 'EMPLOYEE', storeIds: 'all' },
      ]);
    });

    const rows = await base.userRole.findMany({
      where: { userId, roleId: employeeRoleId, tenantId },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].storeId).toBe(0);
  });

  it('replacing role X does NOT delete the user role Y rows', async () => {
    await clearUserRoles();

    // Seed: MANAGEMENT at S1
    await base.userRole.create({
      data: { userId, roleId: managementRoleId, tenantId, storeId: s1Id },
    });

    // Only replace EMPLOYEE assignments (user has none yet → creates fresh)
    await runWithTenant({ tenantId, storeId: null, scope: 'tenant' }, async () => {
      await setUserRoleAssignments(userId, [
        { roleName: 'EMPLOYEE', storeIds: [s2Id] },
      ]);
    });

    // MANAGEMENT row at S1 must still exist
    const mgmtRows = await base.userRole.findMany({
      where: { userId, roleId: managementRoleId, tenantId },
    });
    expect(mgmtRows).toHaveLength(1);
    expect(mgmtRows[0].storeId).toBe(s1Id);

    // EMPLOYEE row at S2 must have been created
    const empRows = await base.userRole.findMany({
      where: { userId, roleId: employeeRoleId, tenantId },
    });
    expect(empRows).toHaveLength(1);
    expect(empRows[0].storeId).toBe(s2Id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cross-tenant guards
// ─────────────────────────────────────────────────────────────────────────────

describe('setUserRoleAssignments — cross-tenant guards', () => {
  it('rejects a userId belonging to another tenant with 404', async () => {
    await expect(
      runWithTenant({ tenantId, storeId: null, scope: 'tenant' }, async () => {
        await setUserRoleAssignments(otherUserId, [
          { roleName: 'EMPLOYEE', storeIds: [s1Id] },
        ]);
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('rejects a storeId belonging to another tenant', async () => {
    await expect(
      runWithTenant({ tenantId, storeId: null, scope: 'tenant' }, async () => {
        await setUserRoleAssignments(userId, [
          { roleName: 'EMPLOYEE', storeIds: [otherStoreId] },
        ]);
      }),
    ).rejects.toThrow(AppError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Input validation
// ─────────────────────────────────────────────────────────────────────────────

describe('setUserRoleAssignments — input validation', () => {
  it('rejects an unknown roleName with 400', async () => {
    await expect(
      runWithTenant({ tenantId, storeId: null, scope: 'tenant' }, async () => {
        await setUserRoleAssignments(userId, [
          { roleName: 'DOES_NOT_EXIST', storeIds: [s1Id] },
        ]);
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects an empty storeIds array with 400', async () => {
    await expect(
      runWithTenant({ tenantId, storeId: null, scope: 'tenant' }, async () => {
        await setUserRoleAssignments(userId, [
          { roleName: 'EMPLOYEE', storeIds: [] },
        ]);
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects mixing storeId 0 with real ids in the same assignment', async () => {
    await expect(
      runWithTenant({ tenantId, storeId: null, scope: 'tenant' }, async () => {
        await setUserRoleAssignments(userId, [
          { roleName: 'EMPLOYEE', storeIds: [0, s1Id] },
        ]);
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects a negative storeId with 400', async () => {
    await expect(
      runWithTenant({ tenantId, storeId: null, scope: 'tenant' }, async () => {
        await setUserRoleAssignments(userId, [
          { roleName: 'EMPLOYEE', storeIds: [-1] },
        ]);
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Return shape
// ─────────────────────────────────────────────────────────────────────────────

describe('setUserRoleAssignments — return value', () => {
  it('returns the full resulting assignment set grouped by roleName', async () => {
    await clearUserRoles();

    const result = await runWithTenant(
      { tenantId, storeId: null, scope: 'tenant' },
      async () => {
        return await setUserRoleAssignments(userId, [
          { roleName: 'EMPLOYEE', storeIds: [s1Id, s2Id] },
        ]);
      },
    );

    expect(result.userId).toBe(userId);
    const emp = result.assignments.find((a) => a.roleName === 'EMPLOYEE');
    expect(emp).toBeDefined();
    expect(Array.isArray(emp!.storeIds)).toBe(true);
    expect((emp!.storeIds as number[]).sort()).toEqual([s1Id, s2Id].sort());
  });

  it('"all" assignment is returned as the string "all"', async () => {
    await clearUserRoles();

    const result = await runWithTenant(
      { tenantId, storeId: null, scope: 'tenant' },
      async () => {
        return await setUserRoleAssignments(userId, [
          { roleName: 'EMPLOYEE', storeIds: 'all' },
        ]);
      },
    );

    const emp = result.assignments.find((a) => a.roleName === 'EMPLOYEE');
    expect(emp?.storeIds).toBe('all');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getUserRoleAssignments
// ─────────────────────────────────────────────────────────────────────────────

describe('getUserRoleAssignments', () => {
  it('returns { roleName: EMPLOYEE, storeIds: [S1, S2] } after assigning at [S1, S2]', async () => {
    await clearUserRoles();

    // Set up via service
    await runWithTenant({ tenantId, storeId: null, scope: 'tenant' }, async () => {
      await setUserRoleAssignments(userId, [
        { roleName: 'EMPLOYEE', storeIds: [s1Id, s2Id] },
      ]);
    });

    const result = await runWithTenant(
      { tenantId, storeId: null, scope: 'tenant' },
      async () => await getUserRoleAssignments(userId),
    );

    expect(result.userId).toBe(userId);
    const emp = result.assignments.find((a) => a.roleName === 'EMPLOYEE');
    expect(emp).toBeDefined();
    expect(Array.isArray(emp!.storeIds)).toBe(true);
    expect((emp!.storeIds as number[]).sort()).toEqual([s1Id, s2Id].sort());
  });

  it('returns storeIds:"all" after reassigning to "all"', async () => {
    await clearUserRoles();

    await runWithTenant({ tenantId, storeId: null, scope: 'tenant' }, async () => {
      await setUserRoleAssignments(userId, [
        { roleName: 'EMPLOYEE', storeIds: 'all' },
      ]);
    });

    const result = await runWithTenant(
      { tenantId, storeId: null, scope: 'tenant' },
      async () => await getUserRoleAssignments(userId),
    );

    const emp = result.assignments.find((a) => a.roleName === 'EMPLOYEE');
    expect(emp?.storeIds).toBe('all');
  });

  it('rejects a userId belonging to another tenant with 404', async () => {
    await expect(
      runWithTenant({ tenantId, storeId: null, scope: 'tenant' }, async () => {
        await getUserRoleAssignments(otherUserId);
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
