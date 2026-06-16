import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AppError } from '../middleware/error.middleware';

const {
  prismaMock,
  hashPassword,
  comparePassword,
  generateToken,
  notificationEventsService,
  deliveryEligibilityService,
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
  notificationEventsService: {
    notifyRegistrationSubmitted: vi.fn(),
  },
  deliveryEligibilityService: {
    evaluateRegistrationAddress: vi.fn(),
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
  comparePassword,
}));

vi.mock('../utils/jwt.util', () => ({
  generateToken,
}));

vi.mock('../utils/logger', () => ({
  logger,
}));

vi.mock('./notificationEvents.service', () => ({
  notificationEventsService,
}));

vi.mock('./deliveryEligibility.service', () => ({
  DeliveryEligibilityService: vi.fn(() => deliveryEligibilityService),
}));

describe('auth service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deliveryEligibilityService.evaluateRegistrationAddress.mockResolvedValue(null);
  });

  it('logs and rejects duplicate registrations', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 1, username: 'dup-user' });
    const { AuthService } = await import('./auth.service');
    const service = new AuthService();

    await expect(service.register({
      username: 'dup-user',
      password: 'secret123',
      phoneNumber: '1234567890',
    })).rejects.toBeInstanceOf(AppError);

    expect(logger.info).toHaveBeenCalledWith('Registration attempt received', expect.objectContaining({
      username: 'dup-user',
    }));
    expect(logger.warn).toHaveBeenCalledWith('Registration rejected: username already exists', {
      username: 'dup-user',
    });
  });

  it('logs and completes successful login', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 7,
      username: 'user-test',
      password: 'hashed',
      approved: true,
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
      username: 'user-test',
      password: 'secret123',
    });

    expect(generateToken).toHaveBeenCalledWith({
      userId: 7,
      username: 'user-test',
      roles: ['ADMIN'],
    });
    expect(logger.info).toHaveBeenCalledWith('Login succeeded', expect.objectContaining({
      userId: 7,
      username: 'user-test',
      roles: ['ADMIN'],
    }));
    expect(result.token).toBe('jwt-token');
    expect(result.user).toEqual(expect.objectContaining({
      id: 7,
      roles: ['ADMIN'],
    }));
  });

  it('emits a registration notification after successful registration', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    hashPassword.mockResolvedValue('hashed-password');
    prismaMock.role.findMany.mockResolvedValue([{ id: 1, name: 'CUSTOMER' }]);
    prismaMock.user.create.mockResolvedValue({
      id: 21,
      username: 'new-user',
      approved: false,
      createdAt: new Date('2024-01-01'),
    });
    prismaMock.userRole.createMany.mockResolvedValue({});
    prismaMock.userRole.findMany.mockResolvedValue([{ roleId: 1 }]);
    prismaMock.role.findMany
      .mockResolvedValueOnce([{ id: 1, name: 'CUSTOMER' }])
      .mockResolvedValueOnce([{ id: 1, name: 'CUSTOMER' }]);

    const { AuthService } = await import('./auth.service');
    const service = new AuthService();

    await service.register({
      username: 'new-user',
      password: 'secret123',
    });

    expect(notificationEventsService.notifyRegistrationSubmitted).toHaveBeenCalledWith(21, 'new-user');
  });

  it('persists delivery metadata when registration address evaluation succeeds', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    hashPassword.mockResolvedValue('hashed-password');
    deliveryEligibilityService.evaluateRegistrationAddress.mockResolvedValue({
      deliveryStatus: 'IN_ZONE',
      deliverySource: 'ZIP_FALLBACK',
      deliveryDistanceMiles: 0,
      deliveryCheckedAt: new Date('2026-04-04T02:00:00.000Z'),
    });
    prismaMock.role.findMany.mockResolvedValue([{ id: 1, name: 'CUSTOMER' }]);
    prismaMock.user.create.mockResolvedValue({
      id: 30,
      username: 'geo-user',
      approved: false,
      createdAt: new Date('2024-01-01'),
    });
    prismaMock.userRole.createMany.mockResolvedValue({});
    prismaMock.userRole.findMany.mockResolvedValue([{ roleId: 1 }]);
    prismaMock.role.findMany
      .mockResolvedValueOnce([{ id: 1, name: 'CUSTOMER' }])
      .mockResolvedValueOnce([{ id: 1, name: 'CUSTOMER' }]);

    const { AuthService } = await import('./auth.service');
    const service = new AuthService();

    await service.register({
      username: 'geo-user',
      password: 'secret123',
      address: '123 Main St, Houston, TX 77083',
      phoneNumber: '1234567890',
    });

    expect(deliveryEligibilityService.evaluateRegistrationAddress).toHaveBeenCalledWith('123 Main St, Houston, TX 77083');
    expect(prismaMock.user.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        deliveryStatus: 'IN_ZONE',
        deliverySource: 'ZIP_FALLBACK',
        deliveryDistanceMiles: 0,
      }),
    }));
  });

  it('logs and rejects unapproved login attempts', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 8,
      username: 'pending-user',
      password: 'hashed',
      approved: false,
      createdAt: new Date('2024-01-01'),
    });
    comparePassword.mockResolvedValue(true);

    const { AuthService } = await import('./auth.service');
    const service = new AuthService();

    await expect(service.login({
      username: 'pending-user',
      password: 'secret123',
    })).rejects.toBeInstanceOf(AppError);

    expect(logger.warn).toHaveBeenCalledWith('Login rejected: account pending approval', expect.objectContaining({
      username: 'pending-user',
      userId: 8,
    }));
  });
});
