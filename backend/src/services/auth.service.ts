import prisma from '../config/database';
import { hashPassword, comparePassword } from '../utils/password.util';
import { generateToken } from '../utils/jwt.util';
import { AppError } from '../middleware/error.middleware';
import { RoleName, isRoleName } from '../constants/roles';
import { logger } from '../utils/logger';

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

export class AuthService {
  /**
   * Register a new user (requires admin approval)
   */
  async register(data: RegisterData) {
    const { username, password, address, cashapp, phoneNumber } = data;
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
        approved: false // Requires admin approval
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

    const userRoles = await prisma.userRole.findMany({
      where: { userId: user.id }
    });

    const roleIds = userRoles.map(ur => ur.roleId);
    const roles = await prisma.role.findMany({
      where: { id: { in: roleIds } }
    });
    const roleMap = new Map(roles.map(r => [r.id, r]));

    const rolesWithNames = userRoles.map(ur => ({
      role: roleMap.get(ur.roleId) ? { name: roleMap.get(ur.roleId)!.name } : null
    }));

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
    const { username, password } = data;
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

    const userRoles = await prisma.userRole.findMany({
      where: { userId: user.id }
    });

    const roleIds = userRoles.map(ur => ur.roleId);
    const roles = await prisma.role.findMany({
      where: { id: { in: roleIds } }
    });
    const roleMap = new Map(roles.map(r => [r.id, r]));

    const rolesWithNames = userRoles.map(ur => ({
      role: roleMap.get(ur.roleId) ? { name: roleMap.get(ur.roleId)!.name } : null
    }));

    const roleNames = rolesWithNames
      .map(ur => ur.role?.name)
      .filter((name): name is RoleName => isRoleName(name));

    const token = generateToken({
      userId: user.id,
      username: user.username,
      roles: roleNames
    });
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
      token
    };
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

    const userRoles = await prisma.userRole.findMany({
      where: { userId }
    });

    const roleIds = userRoles.map(ur => ur.roleId);
    const roles = await prisma.role.findMany({
      where: { id: { in: roleIds } }
    });
    const roleMap = new Map(roles.map(r => [r.id, r]));

    const rolesWithNames = userRoles.map(ur => ({
      role: roleMap.get(ur.roleId) ? { name: roleMap.get(ur.roleId)!.name } : null
    }));

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

  private formatUser<T extends { id: number; username: string; address?: string | null; cashapp?: string | null; phoneNumber?: string | null; approved?: boolean; rejected?: boolean; rejectionNote?: string | null; createdAt: Date; updatedAt?: Date; roles: Array<{ role: { name: string } | null }> }>(user: T) {
    const { id, username, address, cashapp, phoneNumber, approved, rejected, rejectionNote, createdAt, updatedAt } = user;
    return {
      id,
      username,
      ...(address ? { address } : {}),
      ...(cashapp ? { cashapp } : {}),
      ...(phoneNumber ? { phoneNumber } : {}),
      ...(approved !== undefined ? { approved } : {}),
      ...(rejected !== undefined ? { rejected } : {}),
      ...(rejectionNote ? { rejectionNote } : {}),
      roles: this.toRoleNames(user.roles),
      createdAt,
      ...(updatedAt ? { updatedAt } : {})
    };
  }
}

export default new AuthService();
