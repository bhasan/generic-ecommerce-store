import prisma from '../config/database';
import { hashPassword, comparePassword } from '../utils/password.util';
import { generateToken } from '../utils/jwt.util';
import { AppError } from '../middleware/error.middleware';
import { RoleName, isRoleName } from '../constants/roles';

interface RegisterData {
  email: string;
  password: string;
  name: string;
  role?: RoleName;
  roles?: RoleName[];
}

interface LoginData {
  email: string;
  password: string;
}

export class AuthService {
  /**
   * Register a new user
   */
  async register(data: RegisterData) {
    const { email, password, name } = data;
    const requestedRoles = this.normalizeRolesInput(data.roles, data.role);

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      throw new AppError('User with this email already exists', 409);
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    const roleConnections = await this.resolveRoleConnections(requestedRoles);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        roles: {
          create: roleConnections
        }
      },
      include: {
        roles: {
          include: {
            role: true
          }
        }
      }
    });

    // Generate token
    const token = generateToken({
      userId: user.id,
      email: user.email,
      roles: this.toRoleNames(user.roles)
    });

    return {
      user: this.formatUser(user),
      token
    };
  }

  /**
   * Login user
   */
  async login(data: LoginData) {
    const { email, password } = data;

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        roles: {
          include: {
            role: true
          }
        }
      }
    });

    if (!user) {
      throw new AppError('Invalid email or password', 401);
    }

    // Verify password
    const isPasswordValid = await comparePassword(password, user.password);

    if (!isPasswordValid) {
      throw new AppError('Invalid email or password', 401);
    }

    // Generate token
    const token = generateToken({
      userId: user.id,
      email: user.email,
      roles: this.toRoleNames(user.roles)
    });

    return {
      user: this.formatUser(user),
      token
    };
  }

  /**
   * Get current user profile
   */
  async getProfile(userId: number) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: {
          include: {
            role: true
          }
        }
      }
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    return this.formatUser({
      ...user,
      updatedAt: user.updatedAt
    });
  }

  private normalizeRolesInput(roles?: RoleName[] | null, role?: RoleName | null): RoleName[] {
    const allRoles = [
      ...(Array.isArray(roles) ? roles : []),
      ...(role ? [role] : [])
    ].filter((value): value is RoleName => isRoleName(value));

    if (allRoles.length === 0) {
      return ['CUSTOMER'];
    }

    return Array.from(new Set(allRoles));
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

    return dbRoles.map((dbRole) => ({
      role: {
        connect: { id: dbRole.id }
      }
    }));
  }

  private toRoleNames(userRoles: Array<{ role: { name: string } | null }>): RoleName[] {
    return userRoles
      .map(({ role }) => role?.name)
      .filter((name): name is RoleName => isRoleName(name));
  }

  private formatUser<T extends { id: number; email: string; name: string; createdAt: Date; updatedAt?: Date; roles: Array<{ role: { name: string } | null }> }>(user: T) {
    const { id, email, name, createdAt, updatedAt } = user;
    return {
      id,
      email,
      name,
      roles: this.toRoleNames(user.roles),
      createdAt,
      ...(updatedAt ? { updatedAt } : {})
    };
  }
}

export default new AuthService();
