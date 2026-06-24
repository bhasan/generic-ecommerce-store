import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  userRole: { findMany: vi.fn() },
}));
vi.mock('../config/database', () => ({ default: prismaMock }));

describe('getUserRolesWithNames', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns role rows from a single nested query', async () => {
    prismaMock.userRole.findMany.mockResolvedValue([
      { role: { name: 'ADMIN' } },
      { role: { name: 'MANAGEMENT' } },
    ]);
    const { getUserRolesWithNames } = await import('./userRoles.helper');
    const rows = await getUserRolesWithNames(7);
    expect(prismaMock.userRole.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.userRole.findMany.mock.calls[0][0]).toMatchObject({
      where: { userId: 7 },
      include: { role: true },
    });
    expect(rows.map((r) => r.role.name)).toEqual(['ADMIN', 'MANAGEMENT']);
  });
});
