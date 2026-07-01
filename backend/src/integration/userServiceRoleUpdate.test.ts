// backend/src/integration/userServiceRoleUpdate.test.ts
//
// Regression tests for a cross-store privilege-escalation defect in
// UserService.updateUser's role-edit path.
//
// The old code blanket-deleted ALL of a user's UserRole rows and recreated every
// role at storeId 0 (all-stores). That silently destroyed the per-store scoping
// written by the staff-assignment feature: an employee scoped to a single store
// was escalated to EVERY store the moment an admin edited their roles.
//
// The fix reconciles the desired role SET against existing rows, PRESERVING the
// storeId scoping of roles the user already holds. These tests assert that.
//
// Pattern (mirrors staffAssignment.test.ts): getUnscopedPrisma() for
// setup/teardown; runWithTenant for service calls. ALWAYS await inside the
// runWithTenant callback (ALS context rule).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getUnscopedPrisma } from '../config/database';
import { runWithTenant } from '../config/tenantContext';
import { UserService } from '../services/user.service';

const base = getUnscopedPrisma();
const service = new UserService();

let tenantId: number;
let storeId: number; // a real store id (stands in for "store 5")
let userId: number;
let adminId: number;
let employeeRoleId: number;
let driverRoleId: number;
let managementRoleId: number;

beforeAll(async () => {
  const tenant = await base.tenant.create({
    data: { slug: `urr-test-${Date.now()}`, name: 'User Role Update Test Tenant', status: 'ACTIVE' },
  });
  tenantId = tenant.id;

  const store = await base.store.create({
    data: { tenantId, name: 'Store Five', slug: `urr-s5-${Date.now()}`, status: 'ACTIVE' },
  });
  storeId = store.id;

  const user = await base.user.create({
    data: { username: `urr-user-${Date.now()}`, password: 'x', approved: true, tenantId },
  });
  userId = user.id;

  const admin = await base.user.create({
    data: { username: `urr-admin-${Date.now()}`, password: 'x', approved: true, tenantId },
  });
  adminId = admin.id;

  employeeRoleId = (await base.role.findFirstOrThrow({ where: { name: 'EMPLOYEE' } })).id;
  driverRoleId = (await base.role.findFirstOrThrow({ where: { name: 'DELIVERY_DRIVER' } })).id;
  managementRoleId = (await base.role.findFirstOrThrow({ where: { name: 'MANAGEMENT' } })).id;
});

afterAll(async () => {
  await base.userRole.deleteMany({ where: { tenantId } });
  await base.user.deleteMany({ where: { tenantId } });
  await base.store.deleteMany({ where: { tenantId } });
  await base.tenant.deleteMany({ where: { id: tenantId } });
});

async function clearUserRoles() {
  await base.userRole.deleteMany({ where: { userId, tenantId } });
}

function rowsFor(roleId: number) {
  return base.userRole.findMany({ where: { userId, roleId, tenantId } });
}

function asTenant<T>(fn: () => Promise<T>): Promise<T> {
  return runWithTenant({ tenantId, storeId: null, scope: 'tenant' }, fn);
}

describe('UserService.updateUser — preserves per-store role scoping', () => {
  it('adding a role KEEPS an existing role scoped to a real store (not re-created at storeId 0)', async () => {
    // Employee scoped ONLY to a real store (the staff-assignment feature's output).
    await clearUserRoles();
    await base.userRole.create({ data: { userId, roleId: employeeRoleId, tenantId, storeId } });

    // Admin edits roles via the general modal: add DELIVERY_DRIVER, keep EMPLOYEE.
    await asTenant(() =>
      service.updateUser(userId, { roles: ['EMPLOYEE', 'DELIVERY_DRIVER'] }, adminId, ['ADMIN']),
    );

    // EMPLOYEE row must remain scoped to the real store — NOT escalated to 0.
    const empRows = await rowsFor(employeeRoleId);
    expect(empRows).toHaveLength(1);
    expect(empRows[0].storeId).toBe(storeId);

    // The newly-added DELIVERY_DRIVER defaults to all-stores (0).
    const driverRows = await rowsFor(driverRoleId);
    expect(driverRows).toHaveLength(1);
    expect(driverRows[0].storeId).toBe(0);
  });

  it('preserves EVERY row (real store + all-stores) of a role that stays in the set', async () => {
    await clearUserRoles();
    await base.userRole.createMany({
      data: [
        { userId, roleId: employeeRoleId, tenantId, storeId },
        { userId, roleId: employeeRoleId, tenantId, storeId: 0 },
      ],
    });

    await asTenant(() =>
      service.updateUser(userId, { roles: ['EMPLOYEE', 'DELIVERY_DRIVER'] }, adminId, ['ADMIN']),
    );

    const empRows = await rowsFor(employeeRoleId);
    expect(empRows.map((r) => r.storeId ?? 0).sort((a, b) => a - b)).toEqual([0, storeId]);
  });

  it('removing a role deletes ONLY that role rows; other roles per-store rows survive', async () => {
    await clearUserRoles();
    await base.userRole.createMany({
      data: [
        { userId, roleId: employeeRoleId, tenantId, storeId },
        { userId, roleId: managementRoleId, tenantId, storeId },
      ],
    });

    // Drop MANAGEMENT, keep EMPLOYEE.
    await asTenant(() =>
      service.updateUser(userId, { roles: ['EMPLOYEE'] }, adminId, ['ADMIN']),
    );

    const empRows = await rowsFor(employeeRoleId);
    expect(empRows).toHaveLength(1);
    expect(empRows[0].storeId).toBe(storeId);

    const mgmtRows = await rowsFor(managementRoleId);
    expect(mgmtRows).toHaveLength(0);
  });

  it('adding a role to an all-stores (storeId 0) user keeps existing rows at 0', async () => {
    await clearUserRoles();
    await base.userRole.create({ data: { userId, roleId: employeeRoleId, tenantId, storeId: 0 } });

    await asTenant(() =>
      service.updateUser(userId, { roles: ['EMPLOYEE', 'DELIVERY_DRIVER'] }, adminId, ['ADMIN']),
    );

    const empRows = await rowsFor(employeeRoleId);
    expect(empRows).toHaveLength(1);
    expect(empRows[0].storeId).toBe(0);

    const driverRows = await rowsFor(driverRoleId);
    expect(driverRows).toHaveLength(1);
    expect(driverRows[0].storeId).toBe(0);
  });

  it('removing ALL roles deletes every row and drops the user to pending', async () => {
    await clearUserRoles();
    await base.userRole.create({ data: { userId, roleId: employeeRoleId, tenantId, storeId } });
    await base.user.update({ where: { id: userId }, data: { approved: true } });

    const result = await asTenant(() =>
      service.updateUser(userId, { roles: [] }, adminId, ['ADMIN']),
    );

    const allRows = await base.userRole.findMany({ where: { userId, tenantId } });
    expect(allRows).toHaveLength(0);
    expect(result.approved).toBe(false);
  });
});
