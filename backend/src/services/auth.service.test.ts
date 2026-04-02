import { AppError } from '../middleware/error.middleware';

const {
  prismaMock,
  hashPassword,
  comparePassword,
  generateToken,
  logger,
} = vi.hoisted(() => ({
  prismaMock: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    userRole: {
      createMany: vi.fn(),
      findMany: vi.fn(),
    },
    role: {
      findMany: vi.fn(),
    },
  },
  hashPassword: vi.fn(),
  comparePassword: vi.fn(),
  generateToken: vi.fn(),
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
  comparePassword,
}));

vi.mock('../utils/jwt.util', () => ({
  generateToken,
}));

vi.mock('../utils/logger', () => ({
  logger,
}));

describe('auth service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logs and rejects duplicate registrations', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 1, email: 'dup@test.com' });
    const { AuthService } = await import('./auth.service');
    const service = new AuthService();

    await expect(service.register({
      email: 'dup@test.com',
      password: 'secret123',
      name: 'Dup User',
      phoneNumber: '1234567890',
    })).rejects.toBeInstanceOf(AppError);

    expect(logger.info).toHaveBeenCalledWith('Registration attempt received', expect.objectContaining({
      email: 'dup@test.com',
    }));
    expect(logger.warn).toHaveBeenCalledWith('Registration rejected: email already exists', {
      email: 'dup@test.com',
    });
  });

  it('logs and completes successful login', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 7,
      email: 'user@test.com',
      password: 'hashed',
      approved: true,
      name: 'User',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    });
    comparePassword.mockResolvedValue(true);
    prismaMock.userRole.findMany.mockResolvedValue([{ roleId: 1 }]);
    prismaMock.role.findMany.mockResolvedValue([{ id: 1, name: 'ADMIN' }]);
    generateToken.mockReturnValue('jwt-token');

    const { AuthService } = await import('./auth.service');
    const service = new AuthService();
    const result = await service.login({
      email: 'user@test.com',
      password: 'secret123',
    });

    expect(generateToken).toHaveBeenCalledWith({
      userId: 7,
      email: 'user@test.com',
      roles: ['ADMIN'],
    });
    expect(logger.info).toHaveBeenCalledWith('Login succeeded', expect.objectContaining({
      userId: 7,
      email: 'user@test.com',
      roles: ['ADMIN'],
    }));
    expect(result.token).toBe('jwt-token');
    expect(result.user).toEqual(expect.objectContaining({
      id: 7,
      roles: ['ADMIN'],
    }));
  });

  it('logs and rejects unapproved login attempts', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 8,
      email: 'pending@test.com',
      password: 'hashed',
      approved: false,
      name: 'Pending',
      createdAt: new Date('2024-01-01'),
    });
    comparePassword.mockResolvedValue(true);

    const { AuthService } = await import('./auth.service');
    const service = new AuthService();

    await expect(service.login({
      email: 'pending@test.com',
      password: 'secret123',
    })).rejects.toBeInstanceOf(AppError);

    expect(logger.warn).toHaveBeenCalledWith('Login rejected: account pending approval', expect.objectContaining({
      email: 'pending@test.com',
      userId: 8,
    }));
  });
});
