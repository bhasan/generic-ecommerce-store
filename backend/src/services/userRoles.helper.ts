import prisma from '../config/database';

/**
 * Returns a user's role rows (`{ role: { name } }[]`) in ONE nested query, replacing the
 * manual userRole.findMany + role.findMany({ id: { in } }) + Map two-step in auth.service.
 * Shape matches what `formatUser`/`toRoleNames` already consume, so callers stay unchanged.
 */
export async function getUserRolesWithNames(
  userId: number,
): Promise<Array<{ role: { name: string }; storeId?: number | null }>> {
  return prisma.userRole.findMany({
    where: { userId },
    include: { role: true },
  });
}

/**
 * Fetch roles for multiple users in a single query.
 * Returns a Map from userId → Array<{ role: { name: string }; storeId?: number | null }>.
 */
export async function getUserRolesMapForUsers(
  userIds: number[],
): Promise<Map<number, Array<{ role: { name: string }; storeId?: number | null }>>> {
  if (userIds.length === 0) return new Map();

  const rows = await prisma.userRole.findMany({
    where: { userId: { in: userIds } },
    include: { role: true },
  });

  const map = new Map<number, Array<{ role: { name: string }; storeId?: number | null }>>();
  for (const row of rows) {
    if (!map.has(row.userId)) map.set(row.userId, []);
    map.get(row.userId)!.push({ role: { name: row.role.name }, storeId: row.storeId });
  }
  return map;
}

/**
 * Attach roles from a batch map to a user object, in the shape formatUser() expects.
 */
export function formatUserWithRoles<T extends { id: number }>(
  user: T,
  rolesMap: Map<number, Array<{ role: { name: string }; storeId?: number | null }>>,
): T & { roles: Array<{ role: { name: string }; storeId?: number | null }> } {
  return { ...user, roles: rolesMap.get(user.id) ?? [] };
}
