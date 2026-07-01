import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AppError } from '../middleware/error.middleware';

const {
  prismaMock,
  hashPassword,
  comparePassword,
  generateToken,
  generateRefreshTokenValue,
  hashRefreshToken,
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
    refreshToken: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    // Run the transaction callback against the same mock so refreshToken
    // update/create calls inside refresh() are observable.
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(prismaMock)),
  },
  hashPassword: vi.fn(),
  comparePassword: vi.fn(),
  generateToken: vi.fn(),
  generateRefreshTokenValue: vi.fn(),
  hashRefreshToken: vi.fn(),
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
  generateRefreshTokenValue,
  hashRefreshToken,
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
    generateRefreshTokenValue.mockReturnValue('raw-refresh');
    hashRefreshToken.mockImplementation((raw: string) => `hash:${raw}`);
    prismaMock.refreshToken.create.mockResolvedValue({});
    prismaMock.refreshToken.update.mockResolvedValue({});
    prismaMock.refreshToken.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.refreshToken.findFirst.mockResolvedValue(null);
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
    prismaMock.userRole.findMany.mockResolvedValue([{ role: { name: 'ADMIN' } }]);
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
      tenantId: null,
      roles: [{ name: 'ADMIN', storeId: null }],
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
    prismaMock.userRole.findMany.mockResolvedValue([{ role: { name: 'CUSTOMER' } }]);

    const { AuthService } = await import('./auth.service');
    const service = new AuthService();

    await service.register({
      username: 'new-user',
      password: 'secret123',
    });

    expect(prismaMock.userRole.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ userId: 21, storeId: 0 }),
      ]),
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
    prismaMock.userRole.findMany.mockResolvedValue([{ role: { name: 'CUSTOMER' } }]);

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

  it('issues a refresh token on successful login', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 7,
      username: 'user-test',
      password: 'hashed',
      approved: true,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    });
    comparePassword.mockResolvedValue(true);
    prismaMock.userRole.findMany.mockResolvedValue([{ role: { name: 'ADMIN' } }]);
    generateToken.mockReturnValue('jwt-token');

    const { AuthService } = await import('./auth.service');
    const service = new AuthService();
    const result = await service.login({ username: 'user-test', password: 'secret123' });

    expect(result.refreshToken).toBe('raw-refresh');
    expect(prismaMock.refreshToken.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        tokenHash: 'hash:raw-refresh',
        userId: 7,
      }),
    }));
  });

  describe('refresh', () => {
    it('rejects an empty refresh token', async () => {
      const { AuthService } = await import('./auth.service');
      const service = new AuthService();
      await expect(service.refresh('')).rejects.toBeInstanceOf(AppError);
    });

    it('rejects an unknown refresh token', async () => {
      prismaMock.refreshToken.findUnique.mockResolvedValue(null);
      const { AuthService } = await import('./auth.service');
      const service = new AuthService();
      await expect(service.refresh('nope')).rejects.toBeInstanceOf(AppError);
    });

    it('rejects an expired refresh token and revokes it', async () => {
      prismaMock.refreshToken.findUnique.mockResolvedValue({
        id: 1,
        userId: 7,
        familyId: 'fam-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      });
      const { AuthService } = await import('./auth.service');
      const service = new AuthService();
      await expect(service.refresh('expired')).rejects.toBeInstanceOf(AppError);
      expect(prismaMock.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('detects reuse of a token revoked beyond the grace window and revokes the family', async () => {
      prismaMock.refreshToken.findUnique.mockResolvedValue({
        id: 2,
        userId: 7,
        familyId: 'fam-2',
        revokedAt: new Date(Date.now() - 60_000), // 60s ago — beyond the 15s grace
        expiresAt: new Date(Date.now() + 100000),
      });
      const { AuthService } = await import('./auth.service');
      const service = new AuthService();
      await expect(service.refresh('reused')).rejects.toBeInstanceOf(AppError);
      expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { familyId: 'fam-2', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('rotates the live head for a token reused within the grace window (no family revoke)', async () => {
      prismaMock.refreshToken.findUnique.mockResolvedValue({
        id: 5,
        userId: 7,
        familyId: 'fam-5',
        revokedAt: new Date(Date.now() - 2_000), // 2s ago — within the 15s grace
        expiresAt: new Date(Date.now() + 100000),
      });
      // The family's current live head that should be rotated instead.
      prismaMock.refreshToken.findFirst.mockResolvedValue({
        id: 6,
        userId: 7,
        familyId: 'fam-5',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 100000),
      });
      prismaMock.user.findUnique.mockResolvedValue({ id: 7, username: 'user-test' });
      prismaMock.userRole.findMany.mockResolvedValue([{ role: { name: 'ADMIN' } }]);
      generateToken.mockReturnValue('grace-access');
      generateRefreshTokenValue.mockReturnValue('grace-refresh');

      const { AuthService } = await import('./auth.service');
      const service = new AuthService();
      const result = await service.refresh('reused-within-grace');

      expect(result.token).toBe('grace-access');
      expect(result.refreshToken).toBe('grace-refresh');
      // Rotated the live HEAD (id 6), not the replayed token, and did NOT revoke the family.
      expect(prismaMock.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 6 },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prismaMock.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it('rotates the token and mints a new access token on success', async () => {
      prismaMock.refreshToken.findUnique.mockResolvedValue({
        id: 3,
        userId: 7,
        familyId: 'fam-3',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 100000),
      });
      prismaMock.user.findUnique.mockResolvedValue({ id: 7, username: 'user-test' });
      prismaMock.userRole.findMany.mockResolvedValue([{ role: { name: 'ADMIN' } }]);
      generateToken.mockReturnValue('new-access');
      generateRefreshTokenValue.mockReturnValue('new-refresh');

      const { AuthService } = await import('./auth.service');
      const service = new AuthService();
      const result = await service.refresh('valid');

      expect(result.token).toBe('new-access');
      expect(result.refreshToken).toBe('new-refresh');
      // Old token revoked, new token created in the same family.
      expect(prismaMock.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 3 },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prismaMock.refreshToken.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          tokenHash: 'hash:new-refresh',
          userId: 7,
          familyId: 'fam-3',
        }),
      }));
    });
  });

  describe('logout', () => {
    it('revokes the matching refresh token', async () => {
      const { AuthService } = await import('./auth.service');
      const service = new AuthService();
      await service.logout('some-token');
      expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { tokenHash: 'hash:some-token', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('is a no-op when no token is provided', async () => {
      const { AuthService } = await import('./auth.service');
      const service = new AuthService();
      await service.logout(undefined);
      expect(prismaMock.refreshToken.updateMany).not.toHaveBeenCalled();
    });
  });
});
