// backend/src/services/staffAssignment.service.ts
//
// Phase 2e Task 5: Staff ↔ Store Assignment
// Sets which stores a staff member holds a role at.
// Replaces ONLY the named roles' assignments; all other roles are untouched.

import { getUnscopedPrisma } from '../config/database';
import { getTenantContextOrThrow } from '../config/tenantContext';
import { AppError } from '../middleware/error.middleware';
import { isRoleName } from '../constants/roles';

export interface StoreRoleInput {
  roleName: string;
  storeIds: number[] | 'all';
}

export interface StoreRoleResult {
  roleName: string;
  storeIds: number[] | 'all';
}

/**
 * Collapse a role's resolved storeId set into the API-facing shape.
 *
 * A role reads back as 'all' ONLY when its ENTIRE storeId set is exactly
 * [0] (the all-stores sentinel and nothing else) — matching the write
 * path's own normalisation ('all' input → storeIds [0]) and its input
 * validation, which rejects mixing sentinel 0 with real store ids within a
 * single assignment.
 *
 * Any other set — specific store ids, or a mixed/anomalous set containing 0
 * alongside real ids — is returned as the real, sorted array of ids. A
 * mixed set shouldn't occur via the normal write path (it's rejected up
 * front), but historical rows or a direct DB edit could still produce one;
 * silently collapsing that to 'all' would mask the specific store ids from
 * a caller reading it back, so this returns the real array instead.
 *
 * Shared by `setUserRoleAssignments` and `getUserRoleAssignments` so the
 * write and read collapse rules can never diverge.
 */
function collapseStoreIds(storeIds: number[]): number[] | 'all' {
  if (storeIds.length === 1 && storeIds[0] === 0) {
    return 'all';
  }
  return [...storeIds].sort((a, b) => a - b);
}

/**
 * Replace the store assignments for the given roles on a single staff user.
 *
 * - Only roles explicitly listed in `assignments` are replaced; the user's
 *   OTHER roles are left untouched (scalpel, not sledgehammer).
 * - 'all' normalises to storeId sentinel 0. An empty storeIds array is rejected.
 * - Mixing storeId 0 with real store ids in the SAME assignment is rejected
 *   (all-stores supersedes specific stores — caller should use 'all').
 * - Every real storeId (> 0) must belong to the caller's tenant.
 * - The target user must belong to the caller's tenant.
 */
export async function setUserRoleAssignments(
  userId: number,
  assignments: StoreRoleInput[],
): Promise<{ userId: number; assignments: StoreRoleResult[] }> {
  const prisma = getUnscopedPrisma();
  const { tenantId } = getTenantContextOrThrow();

  // ── 1. Validate target user belongs to this tenant ──────────────────────────
  const user = await prisma.user.findFirst({ where: { id: userId, tenantId } });
  if (!user) {
    throw new AppError(`User ${userId} not found in this tenant`, 404);
  }

  // ── 2. Validate + resolve each assignment ────────────────────────────────────
  const processed: Array<{ roleId: number; roleName: string; storeIds: number[] }> = [];

  // Roles are a small, global (unscoped) table — batch-fetch every role
  // referenced by this call in ONE query up front instead of one findFirst
  // round-trip per assignment inside the loop below (avoids N+1).
  const requestedRoleNames = [...new Set(assignments.map((a) => a.roleName))];
  const foundRoles = await prisma.role.findMany({
    where: { name: { in: requestedRoleNames } },
  });
  const roleByName = new Map(foundRoles.map((r) => [r.name, r]));

  for (const assignment of assignments) {
    // Validate roleName against the known enum
    if (!isRoleName(assignment.roleName)) {
      throw new AppError(`Unknown role name: ${assignment.roleName}`, 400);
    }

    const role = roleByName.get(assignment.roleName);
    if (!role) {
      throw new AppError(`Role not found in database: ${assignment.roleName}`, 400);
    }

    // Normalize storeIds
    let resolvedStoreIds: number[];

    if (assignment.storeIds === 'all') {
      resolvedStoreIds = [0];
    } else {
      const rawIds = assignment.storeIds;
      if (rawIds.length === 0) {
        throw new AppError(
          `Assignment for role "${assignment.roleName}" must grant at least one store id or use 'all'`,
          400,
        );
      }

      // Reject negative or non-integer store ids (only 0 sentinel and positive ids are valid)
      const invalidIds = rawIds.filter((id) => !Number.isInteger(id) || id < 0);
      if (invalidIds.length > 0) {
        throw new AppError(
          `Assignment for role "${assignment.roleName}": invalid store id(s) ${invalidIds.join(', ')} — ` +
            `store ids must be non-negative integers (use 'all' to grant all-stores access)`,
          400,
        );
      }

      // Deduplicate
      resolvedStoreIds = [...new Set(rawIds)];

      // Reject mixing sentinel 0 with real ids in the same assignment
      if (resolvedStoreIds.includes(0) && resolvedStoreIds.length > 1) {
        throw new AppError(
          `Assignment for role "${assignment.roleName}": cannot mix storeId 0 (all-stores sentinel) ` +
            `with real store ids — pass 'all' to grant access to all stores`,
          400,
        );
      }

      // Validate all real store ids (> 0) belong to this tenant
      const realIds = resolvedStoreIds.filter((id) => id > 0);
      if (realIds.length > 0) {
        const foundStores = await prisma.store.findMany({
          where: { tenantId, id: { in: realIds } },
          select: { id: true },
        });
        const foundSet = new Set(foundStores.map((s) => s.id));
        const missingIds = realIds.filter((id) => !foundSet.has(id));
        if (missingIds.length > 0) {
          throw new AppError(
            `Store id(s) not found in this tenant: ${missingIds.join(', ')}`,
            404,
          );
        }
      }
    }

    processed.push({ roleId: role.id, roleName: assignment.roleName, storeIds: resolvedStoreIds });
  }

  // ── 3. Replace assignments in a single transaction ───────────────────────────
  const namedRoleIds = processed.map((p) => p.roleId);

  await prisma.$transaction(async (tx) => {
    // Delete ONLY the named roles' existing rows for this user+tenant
    await tx.userRole.deleteMany({
      where: { userId, tenantId, roleId: { in: namedRoleIds } },
    });

    // Build new rows: one UserRole per (roleId, storeId) pair
    const newRows = processed.flatMap(({ roleId, storeIds }) =>
      storeIds.map((storeId) => ({ userId, roleId, tenantId, storeId })),
    );

    if (newRows.length > 0) {
      await tx.userRole.createMany({ data: newRows });
    }
  });

  // ── 4. Return updated full assignment set for this user ──────────────────────
  const resultRows = await prisma.userRole.findMany({
    where: { userId, tenantId },
    include: { role: { select: { name: true } } },
  });

  // Group by roleName → storeIds[]
  const grouped: Record<string, number[]> = {};
  for (const row of resultRows) {
    const name = row.role.name;
    if (!grouped[name]) grouped[name] = [];
    grouped[name].push(row.storeId ?? 0);
  }

  const resultAssignments: StoreRoleResult[] = Object.entries(grouped).map(
    ([roleName, storeIds]) => ({
      roleName,
      storeIds: collapseStoreIds(storeIds),
    }),
  );

  return { userId, assignments: resultAssignments };
}

/**
 * Read the current store assignments for a staff user, grouped by role.
 *
 * Returns the same `{ userId, assignments }` shape as `setUserRoleAssignments`,
 * using the same `collapseStoreIds` rule: a role reads back as 'all' only
 * when its entire storeId set is exactly [0]. Any other set (including a
 * mixed/anomalous 0 + real-id set from historical data) is returned as the
 * real array of ids.
 */
export async function getUserRoleAssignments(
  userId: number,
): Promise<{ userId: number; assignments: StoreRoleResult[] }> {
  const prisma = getUnscopedPrisma();
  const { tenantId } = getTenantContextOrThrow();

  // Validate the user belongs to this tenant
  const user = await prisma.user.findFirst({ where: { id: userId, tenantId } });
  if (!user) {
    throw new AppError(`User ${userId} not found in this tenant`, 404);
  }

  // Read all UserRole rows for this user+tenant, joining role name
  const rows = await prisma.userRole.findMany({
    where: { userId, tenantId },
    include: { role: { select: { name: true } } },
  });

  // Group by roleName → storeIds[]
  const grouped: Record<string, number[]> = {};
  for (const row of rows) {
    const name = row.role.name;
    if (!grouped[name]) grouped[name] = [];
    grouped[name].push(row.storeId ?? 0);
  }

  const assignments: StoreRoleResult[] = Object.entries(grouped).map(
    ([roleName, storeIds]) => ({
      roleName,
      storeIds: collapseStoreIds(storeIds),
    }),
  );

  return { userId, assignments };
}
