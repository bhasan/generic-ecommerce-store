import prisma from '../config/database';

/**
 * Returns a user's role rows (`{ role: { name } }[]`) in ONE nested query, replacing the
 * manual userRole.findMany + role.findMany({ id: { in } }) + Map two-step in auth.service.
 * Shape matches what `formatUser`/`toRoleNames` already consume, so callers stay unchanged.
 */
export async function getUserRolesWithNames(
  userId: number,
): Promise<Array<{ role: { name: string } }>> {
  return prisma.userRole.findMany({
    where: { userId },
    include: { role: true },
  });
}
