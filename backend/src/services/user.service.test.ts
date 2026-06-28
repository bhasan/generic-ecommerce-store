import { describe, it, expect, beforeEach, vi } from 'vitest';
const {
  prismaMock,
  hashPassword,
  notificationEventsService,
  logger,
} = vi.hoisted(() => ({
  prismaMock: {
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    userRole: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
      create: vi.fn(),
    },
    role: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
  hashPassword: vi.fn(),
  notificationEventsService: {
    notifyAccountApproved: vi.fn(),
    notifyAccountRejected: vi.fn(),
  },
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../config/database', () => ({
  default: prismaMock,
}));

vi.mock('../utils/password.util', () => ({
  hashPassword,
}));

vi.mock('../utils/logger', () => ({
  logger,
}));

vi.mock('./notificationEvents.service', () => ({
  notificationEventsService,
}));

vi.mock('./userRoles.helper', () => ({
  getUserRolesWithNames: vi.fn(),
  getUserRolesMapForUsers: vi.fn(),
  formatUserWithRoles: vi.fn((user, rolesMap) => ({ ...user, roles: rolesMap.get(user.id) ?? [] })),
}));

describe('user service logging', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logs updateUser actor, fields, and resulting roles', async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce({
        id: 5,
        email: 'before@test.com',
        name: 'Before',
        approved: false,
        rejected: false,
      });
    prismaMock.user.update.mockResolvedValue({
      id: 5,
      email: 'after@test.com',
      name: 'After',
      approved: false,
      rejected: false,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-02'),
    });
    hashPassword.mockResolvedValue('hashed-password');

    const { getUserRolesWithNames } = await import('./userRoles.helper');
    vi.mocked(getUserRolesWithNames).mockResolvedValue([{ role: { name: 'CUSTOMER' } }]);

    const { UserService } = await import('./user.service');
    const service = new UserService();

    const result = await service.updateUser(
      5,
      { name: 'After', password: 'secret123' },
      9,
      ['ADMIN']
    );

    expect(logger.info).toHaveBeenCalledWith('Updating user', expect.objectContaining({
      actorUserId: 9,
      targetUserId: 5,
      fields: ['name', 'password'],
    }));
    expect(logger.info).toHaveBeenCalledWith('User updated', expect.objectContaining({
      actorUserId: 9,
      targetUserId: 5,
      roles: ['CUSTOMER'],
    }));
    expect(result).toEqual(expect.objectContaining({
      id: 5,
      roles: ['CUSTOMER'],
    }));
  });

  it('logs pending registration counts', async () => {
    const users = [
      { id: 1, email: 'a@test.com', name: 'A', approved: false, rejected: false, createdAt: new Date('2024-01-01') },
      { id: 2, email: 'b@test.com', name: 'B', approved: false, rejected: false, createdAt: new Date('2024-01-02') },
    ];
    prismaMock.user.findMany
      .mockResolvedValueOnce(users)
      .mockResolvedValueOnce(users)
      .mockResolvedValueOnce(users);
    prismaMock.userRole.findMany
      .mockResolvedValueOnce([{ userId: 1, roleId: 1 }])
      .mockResolvedValueOnce([{ userId: 1, roleId: 1 }]);
    prismaMock.role.findMany.mockResolvedValue([{ id: 1, name: 'CUSTOMER' }]);

    const { UserService } = await import('./user.service');
    const service = new UserService();

    const result = await service.getPendingRegistrations();

    expect(logger.info).toHaveBeenCalledWith('Fetched pending registrations', {
      count: 2,
      usersWithoutRoles: 1,
    });
    expect(result).toHaveLength(2);
  });

  it('logs user deletion details', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 8,
      username: 'delete-user',
      approved: true,
      rejected: false,
    });
    prismaMock.user.delete.mockResolvedValue({});

    const { UserService } = await import('./user.service');
    const service = new UserService();

    const result = await service.deleteUser(8);

    expect(logger.info).toHaveBeenCalledWith('User deleted', {
      targetUserId: 8,
      username: 'delete-user',
      approved: true,
      rejected: false,
    });
    expect(result).toEqual({ message: 'User deleted successfully' });
  });

  it('emits an approval notification when approving a user', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 14,
      approved: false,
    });
    prismaMock.userRole.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ userId: 14, roleId: 1 }]);
    prismaMock.role.findUnique.mockResolvedValue({ id: 1, name: 'CUSTOMER' });
    prismaMock.userRole.create.mockResolvedValue({});
    prismaMock.user.update.mockResolvedValue({
      id: 14,
      username: 'approved-user',
      approved: true,
      createdAt: new Date('2024-01-01'),
    });
    prismaMock.role.findMany.mockResolvedValue([{ id: 1, name: 'CUSTOMER' }]);

    const { UserService } = await import('./user.service');
    const service = new UserService();

    await service.approveUser(14);

    expect(notificationEventsService.notifyAccountApproved).toHaveBeenCalledWith(14);
  });

  it('emits a rejection notification when rejecting a user', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 15,
      approved: false,
      rejected: false,
    });
    prismaMock.user.update.mockResolvedValue({
      id: 15,
      username: 'rejected-user',
      rejected: true,
      createdAt: new Date('2024-01-01'),
    });
    prismaMock.userRole.findMany.mockResolvedValue([]);
    prismaMock.role.findMany.mockResolvedValue([]);

    const { UserService } = await import('./user.service');
    const service = new UserService();

    await service.rejectUser(15, 'note');

    expect(notificationEventsService.notifyAccountRejected).toHaveBeenCalledWith(15);
  });

  it('getPendingRegistrationCount queries only unapproved non-rejected users', async () => {
    prismaMock.user.count.mockResolvedValue(5);

    const { UserService } = await import('./user.service');
    const service = new UserService();

    const result = await service.getPendingRegistrationCount();

    expect(prismaMock.user.count).toHaveBeenCalledWith({
      where: { approved: false, rejected: false },
    });
    expect(result).toBe(5);
  });
});
