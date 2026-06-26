import { randomUUID } from 'crypto';
import prisma from '../config/database';
import { DeliveryEligibilitySource, DeliveryZoneStatus } from '../../generated/prisma';
import { hashPassword, comparePassword } from '../utils/password.util';
import {
  generateToken,
  generateRefreshTokenValue,
  hashRefreshToken,
} from '../utils/jwt.util';
import { AppError } from '../middleware/error.middleware';
import { REFRESH_TOKEN_TTL_MS } from '../utils/authCookie.util';
import { RoleName, isRoleName } from '../constants/roles';
import { logger } from '../utils/logger';
import { notificationEventsService } from './notificationEvents.service';
import { DeliveryEligibilityService } from './deliveryEligibility.service';
import { getUserRolesWithNames } from './userRoles.helper';

interface RegisterData {
  username: string;
  password: string;
  address?: string;
  cashapp?: string;
  phoneNumber?: string;
  role?: RoleName;
  roles?: RoleName[];
}

interface LoginData {
  username: string;
  password: string;
}

const deliveryEligibilityService = new DeliveryEligibilityService();

// A just-rotated refresh token replayed within this window is treated as a
// benign concurrent refresh (e.g. multi-tab) rather than theft. Kept short to
// bound the security weakening.
const REFRESH_REUSE_GRACE_MS = 15 * 1000;

export class AuthService {
  /**
   * Register a new user (requires admin approval)
   */
  async register(data: RegisterData) {
    const { password, address, cashapp, phoneNumber } = data;
    const username = data.username.trim().toLowerCase();
    // Registration logs intentionally describe the business decision path without
    // changing the approval/token semantics for new accounts.
    logger.info('Registration attempt received', {
      username,
      hasAddress: Boolean(address),
      hasCashapp: Boolean(cashapp),
      hasPhoneNumber: Boolean(phoneNumber),
    });

    // New registrations always get CUSTOMER role and require approval
    const requestedRoles: RoleName[] = ['CUSTOMER'];

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { username }
    });

    if (existingUser) {
      logger.warn('Registration rejected: username already exists', { username });
      throw new AppError('User with this username already exists', 409);
    }

    // Hash password
    const hashedPassword = await hashPassword(password);
    let deliveryZoneMetadata = null;
    if (address?.trim()) {
      try {
        deliveryZoneMetadata = await deliveryEligibilityService.evaluateRegistrationAddress(address);
      } catch (error) {
        logger.warn('Registration delivery-zone evaluation failed; continuing as unverified', {
          username,
          message: error instanceof Error ? error.message : String(error),
        });
        deliveryZoneMetadata = {
          deliveryStatus: DeliveryZoneStatus.UNVERIFIED,
          deliverySource: DeliveryEligibilitySource.NONE,
          deliveryDistanceMiles: null,
          deliveryCheckedAt: new Date(),
        };
      }
    }

    const roleConnections = await this.resolveRoleConnections(requestedRoles);
    logger.info('Registration roles resolved', {
      username,
      roles: requestedRoles,
      resolvedRoleCount: roleConnections.length,
    });

    // Create user (not approved by default)
    const user = await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
        address: address || null,
        cashapp: cashapp || null,
        phoneNumber: phoneNumber || null,
        approved: false, // Requires admin approval
        ...(deliveryZoneMetadata ? {
          deliveryStatus: deliveryZoneMetadata.deliveryStatus,
          deliverySource: deliveryZoneMetadata.deliverySource,
          deliveryDistanceMiles: deliveryZoneMetadata.deliveryDistanceMiles,
          deliveryCheckedAt: deliveryZoneMetadata.deliveryCheckedAt,
        } : {}),
      }
    });
    logger.info('Registration user record created', {
      userId: user.id,
      username: user.username,
      approved: user.approved,
    });

    // Create user roles
    await prisma.userRole.createMany({
      data: roleConnections.map(role => ({
        userId: user.id,
        roleId: role.id
      }))
    });
    logger.info('Registration role assignments created', {
      userId: user.id,
      username: user.username,
      roles: requestedRoles,
    });

    await notificationEventsService.notifyRegistrationSubmitted(user.id, user.username);

    const rolesWithNames = await getUserRolesWithNames(user.id);

    return {
      user: this.formatUser({
        ...user,
        roles: rolesWithNames
      }),
      message: 'Registration successful. Please visit the store to get approved before logging in.'
    };
  }

  /**
   * Login user
   */
  async login(data: LoginData) {
    const { password } = data;
    const username = data.username.trim().toLowerCase();
    // Login decision logs are used by tests and support flows to distinguish
    // bad credentials, approval gating, and successful token issuance.
    logger.info('Login attempt received', { username });

    const user = await prisma.user.findUnique({
      where: { username }
    });

    if (!user) {
      logger.warn('Login rejected: user not found', { username });
      throw new AppError('Invalid username or password', 401);
    }

    const isPasswordValid = await comparePassword(password, user.password);

    if (!isPasswordValid) {
      logger.warn('Login rejected: password mismatch', {
        username,
        userId: user.id,
      });
      throw new AppError('Invalid username or password', 401);
    }

    if (!user.approved) {
      logger.warn('Login rejected: account pending approval', {
        username,
        userId: user.id,
      });
      throw new AppError('Your account is pending approval. Please visit the store to get approved.', 403);
    }

    const rolesWithNames = await getUserRolesWithNames(user.id);
    const roleNames = this.toRoleNames(rolesWithNames);

    const token = generateToken({
      userId: user.id,
      username: user.username,
      roles: roleNames
    });

    // Start a fresh rotation family for this login session.
    const refreshToken = await this.issueRefreshToken(user.id, randomUUID());

    logger.info('Login succeeded', {
      userId: user.id,
      username: user.username,
      roles: roleNames,
    });

    return {
      user: this.formatUser({
        ...user,
        roles: rolesWithNames
      }),
      token,
      refreshToken
    };
  }

  /**
   * Exchange a valid refresh token for a new access token + rotated refresh
   * token. Implements rotation with reuse detection:
   *   - unknown token         → 401 (never issued / already rotated away)
   *   - expired token         → 401
   *   - already-revoked token → see grace window below, else theft → revoke family → 401
   *   - otherwise             → revoke this row, mint a new one in the family
   *
   * Grace window: a token revoked very recently (within REFRESH_REUSE_GRACE_MS)
   * is treated as a benign concurrent/duplicate refresh — e.g. two browser tabs
   * sharing one cookie that both fire /refresh before either response lands.
   * Instead of revoking the family (which would log the user out everywhere), we
   * rotate the family's current live head so both callers end up with valid
   * tokens. A revoked token replayed AFTER the grace window is still treated as
   * theft. This bounds the weakening to a short window.
   */
  async refresh(rawToken: string) {
    if (!rawToken) {
      throw new AppError('Refresh token is required', 401);
    }

    const tokenHash = hashRefreshToken(rawToken);
    const existing = await prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!existing) {
      logger.warn('Refresh rejected: token not found');
      throw new AppError('Invalid refresh token', 401);
    }

    if (existing.revokedAt) {
      const revokedAgoMs = Date.now() - existing.revokedAt.getTime();
      if (revokedAgoMs <= REFRESH_REUSE_GRACE_MS) {
        // Benign concurrent reuse: rotate the family's live head instead of
        // revoking the family.
        const head = await prisma.refreshToken.findFirst({
          where: { familyId: existing.familyId, revokedAt: null, expiresAt: { gt: new Date() } },
          orderBy: { createdAt: 'desc' },
        });
        if (head) {
          logger.info('Refresh within reuse grace window — rotating live head', {
            userId: head.userId,
            familyId: head.familyId,
          });
          return this.rotateAndMint(head.id, head.userId, head.familyId);
        }
      }
      // A revoked token replayed past the grace window (or with no live head)
      // is a theft signal — revoke the whole family.
      logger.warn('Refresh reuse detected — revoking token family', {
        userId: existing.userId,
        familyId: existing.familyId,
      });
      await this.revokeFamily(existing.familyId);
      throw new AppError('Invalid refresh token', 401);
    }

    if (existing.expiresAt.getTime() <= Date.now()) {
      logger.warn('Refresh rejected: token expired', { userId: existing.userId });
      await prisma.refreshToken.update({
        where: { id: existing.id },
        data: { revokedAt: new Date() },
      });
      throw new AppError('Invalid refresh token', 401);
    }

    return this.rotateAndMint(existing.id, existing.userId, existing.familyId);
  }

  /**
   * Revoke the given refresh-token row and mint a fresh access token + a new
   * refresh token in the same family. Shared by the normal rotation path and
   * the grace-window path.
   */
  private async rotateAndMint(tokenId: number, userId: number, familyId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      logger.warn('Refresh rejected: user no longer exists', { userId });
      await this.revokeFamily(familyId);
      throw new AppError('Invalid refresh token', 401);
    }

    const rolesWithNames = await getUserRolesWithNames(user.id);
    const roleNames = this.toRoleNames(rolesWithNames);

    const token = generateToken({
      userId: user.id,
      username: user.username,
      roles: roleNames,
    });

    // Rotate: revoke the presented/head token and mint a new one in the family.
    const refreshToken = await prisma.$transaction(async (tx) => {
      await tx.refreshToken.update({
        where: { id: tokenId },
        data: { revokedAt: new Date() },
      });
      const raw = generateRefreshTokenValue();
      await tx.refreshToken.create({
        data: {
          tokenHash: hashRefreshToken(raw),
          userId: user.id,
          familyId,
          expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        },
      });
      return raw;
    });

    logger.info('Refresh succeeded', { userId: user.id, familyId });

    return { token, refreshToken };
  }

  /**
   * Revoke a single refresh token (explicit logout). No-op if the token is
   * unknown or already revoked — logout should never error.
   */
  async logout(rawToken: string | undefined) {
    if (!rawToken) return;
    const tokenHash = hashRefreshToken(rawToken);
    await prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Revoke every active refresh token for a user ("log out everywhere").
   */
  async revokeAllUserTokens(userId: number) {
    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Issue and persist a new refresh token in the given family. Returns the raw value. */
  private async issueRefreshToken(userId: number, familyId: string): Promise<string> {
    const raw = generateRefreshTokenValue();
    await prisma.refreshToken.create({
      data: {
        tokenHash: hashRefreshToken(raw),
        userId,
        familyId,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });
    return raw;
  }

  /** Revoke all not-yet-revoked tokens in a rotation family. */
  private async revokeFamily(familyId: string) {
    await prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Get current user profile
   */
  async getProfile(userId: number) {
    // Keep profile lookup logs lightweight: this is a hot path, but having a
    // trace here makes stale-token/user-deleted investigations much faster.
    logger.debug('Profile lookup requested', { userId });
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      logger.warn('Profile lookup failed: user not found', { userId });
      throw new AppError('User not found', 404);
    }

    const rolesWithNames = await getUserRolesWithNames(userId);

    return this.formatUser({
      ...user,
      roles: rolesWithNames,
      updatedAt: user.updatedAt
    });
  }

  private async resolveRoleConnections(roleNames: RoleName[]) {
    // Centralizing role resolution keeps register/update flows consistent and
    // gives us one place to log invalid role drift from seed/config changes.
    const dbRoles = await prisma.role.findMany({
      where: {
        name: {
          in: roleNames
        }
      }
    });

    if (dbRoles.length !== roleNames.length) {
      const missing = roleNames.filter(
        (name) => !dbRoles.some((dbRole) => dbRole.name === name)
      );
      logger.warn('Role resolution failed', {
        requestedRoles: roleNames,
        missingRoles: missing,
      });
      throw new AppError(`Invalid roles: ${missing.join(', ')}`, 400);
    }

    return dbRoles;
  }

  private toRoleNames(userRoles: Array<{ role: { name: string } | null }>): RoleName[] {
    return userRoles
      .map(({ role }) => role?.name)
      .filter((name): name is RoleName => isRoleName(name));
  }

  private formatUser<T extends {
    id: number;
    username: string;
    address?: string | null;
    cashapp?: string | null;
    phoneNumber?: string | null;
    approved?: boolean;
    rejected?: boolean;
    rejectionNote?: string | null;
    deliveryStatus?: DeliveryZoneStatus | null;
    deliverySource?: DeliveryEligibilitySource | null;
    deliveryDistanceMiles?: number | null;
    deliveryCheckedAt?: Date | null;
    createdAt: Date;
    updatedAt?: Date;
    roles: Array<{ role: { name: string } | null }>;
  }>(user: T) {
    const {
      id,
      username,
      address,
      cashapp,
      phoneNumber,
      approved,
      rejected,
      rejectionNote,
      deliveryStatus,
      deliverySource,
      deliveryDistanceMiles,
      deliveryCheckedAt,
      createdAt,
      updatedAt,
    } = user;
    return {
      id,
      username,
      ...(address ? { address } : {}),
      ...(cashapp ? { cashapp } : {}),
      ...(phoneNumber ? { phoneNumber } : {}),
      ...(approved !== undefined ? { approved } : {}),
      ...(rejected !== undefined ? { rejected } : {}),
      ...(rejectionNote ? { rejectionNote } : {}),
      ...(deliveryStatus !== undefined && deliveryStatus !== null ? { deliveryStatus } : {}),
      ...(deliverySource !== undefined && deliverySource !== null ? { deliverySource } : {}),
      ...(deliveryDistanceMiles !== undefined && deliveryDistanceMiles !== null ? { deliveryDistanceMiles } : {}),
      ...(deliveryCheckedAt !== undefined && deliveryCheckedAt !== null ? { deliveryCheckedAt } : {}),
      roles: this.toRoleNames(user.roles),
      createdAt,
      ...(updatedAt ? { updatedAt } : {})
    };
  }
}

export default new AuthService();
