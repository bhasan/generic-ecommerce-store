import prisma from '../config/database';
import { hashPassword, comparePassword } from '../utils/password.util';
import { generateToken } from '../utils/jwt.util';
import { AppError } from '../middleware/error.middleware';
import { RoleName, isRoleName } from '../constants/roles';

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

    // New registrations always get CUSTOMER role and require approval
    const requestedRoles: RoleName[] = ['CUSTOMER'];

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { username }
    });

    if (existingUser) {
      throw new AppError('User with this username already exists', 409);
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    const roleConnections = await this.resolveRoleConnections(requestedRoles);

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

    // Create user roles
    await prisma.userRole.createMany({
      data: roleConnections.map(role => ({
        userId: user.id,
        roleId: role.id
      }))
    });

    // Fetch user roles for response
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

    // Don't generate token for unapproved users
    // They need to wait for admin approval before logging in

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

    // Find user
    const user = await prisma.user.findUnique({
      where: { username }
    });

    if (!user) {
      throw new AppError('Invalid username or password', 401);
    }

    // Verify password
    const isPasswordValid = await comparePassword(password, user.password);

    if (!isPasswordValid) {
      throw new AppError('Invalid username or password', 401);
    }

    // Check if user is approved
    if (!user.approved) {
      throw new AppError('Your account is pending approval. Please visit the store to get approved.', 403);
    }

    // Fetch user roles
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

    // Generate token
    const roleNames = rolesWithNames
      .map(ur => ur.role?.name)
      .filter((name): name is RoleName => isRoleName(name));

    const token = generateToken({
      userId: user.id,
      username: user.username,
      roles: roleNames
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
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Fetch user roles
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
