const {
  prismaMock,
  hashPassword,
  logger,
} = vi.hoisted(() => ({
  prismaMock: {
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
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
    prismaMock.userRole.findMany
      .mockResolvedValueOnce([{ userId: 5, roleId: 1 }])
      .mockResolvedValueOnce([{ userId: 5, roleId: 1 }]);
    prismaMock.role.findMany
      .mockResolvedValueOnce([{ id: 1, name: 'CUSTOMER' }])
      .mockResolvedValueOnce([{ id: 1, name: 'CUSTOMER' }]);
    hashPassword.mockResolvedValue('hashed-password');

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
      usersWithoutRoles: 2,
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
});
