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

describe('getUserRolesMapForUsers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty Map for empty userIds', async () => {
    const { getUserRolesMapForUsers } = await import('./userRoles.helper');
    const map = await getUserRolesMapForUsers([]);
    expect(map.size).toBe(0);
    expect(prismaMock.userRole.findMany).not.toHaveBeenCalled();
  });

  it('returns map with single userId and correct roles', async () => {
    prismaMock.userRole.findMany.mockResolvedValue([
      { userId: 5, role: { name: 'ADMIN' } },
      { userId: 5, role: { name: 'MANAGEMENT' } },
    ]);
    const { getUserRolesMapForUsers } = await import('./userRoles.helper');
    const map = await getUserRolesMapForUsers([5]);
    expect(map.size).toBe(1);
    expect(map.get(5)).toEqual([
      { role: { name: 'ADMIN' } },
      { role: { name: 'MANAGEMENT' } },
    ]);
    expect(prismaMock.userRole.findMany).toHaveBeenCalledWith({
      where: { userId: { in: [5] } },
      include: { role: true },
    });
  });

  it('returns map with multiple userIds and correct roles', async () => {
    prismaMock.userRole.findMany.mockResolvedValue([
      { userId: 1, role: { name: 'ADMIN' } },
      { userId: 2, role: { name: 'CUSTOMER' } },
      { userId: 2, role: { name: 'MANAGEMENT' } },
      { userId: 3, role: { name: 'DRIVER' } },
    ]);
    const { getUserRolesMapForUsers } = await import('./userRoles.helper');
    const map = await getUserRolesMapForUsers([1, 2, 3]);
    expect(map.size).toBe(3);
    expect(map.get(1)).toEqual([{ role: { name: 'ADMIN' } }]);
    expect(map.get(2)).toEqual([
      { role: { name: 'CUSTOMER' } },
      { role: { name: 'MANAGEMENT' } },
    ]);
    expect(map.get(3)).toEqual([{ role: { name: 'DRIVER' } }]);
  });

  it('does not include userId in map if not in DB', async () => {
    prismaMock.userRole.findMany.mockResolvedValue([
      { userId: 1, role: { name: 'ADMIN' } },
    ]);
    const { getUserRolesMapForUsers } = await import('./userRoles.helper');
    const map = await getUserRolesMapForUsers([1, 2, 3]);
    expect(map.size).toBe(1);
    expect(map.has(1)).toBe(true);
    expect(map.has(2)).toBe(false);
    expect(map.has(3)).toBe(false);
  });
});

describe('formatUserWithRoles', () => {
  beforeEach(() => vi.clearAllMocks());

  it('attaches roles from map to user', async () => {
    const { formatUserWithRoles } = await import('./userRoles.helper');
    const user = { id: 1, username: 'alice' };
    const rolesMap = new Map([
      [1, [{ role: { name: 'ADMIN' } }]],
    ]);
    const result = formatUserWithRoles(user, rolesMap);
    expect(result).toEqual({
      id: 1,
      username: 'alice',
      roles: [{ role: { name: 'ADMIN' } }],
    });
  });

  it('attaches empty roles array if user not in map', async () => {
    const { formatUserWithRoles } = await import('./userRoles.helper');
    const user = { id: 2, username: 'bob' };
    const rolesMap = new Map([
      [1, [{ role: { name: 'ADMIN' } }]],
    ]);
    const result = formatUserWithRoles(user, rolesMap);
    expect(result).toEqual({
      id: 2,
      username: 'bob',
      roles: [],
    });
  });
});
