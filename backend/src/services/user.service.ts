import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { hashPassword } from '../utils/password.util';
import { RoleName, isRoleName } from '../constants/roles';

interface UpdateUserData {
  email?: string;
  name?: string;
  password?: string;
  roles?: RoleName[];
}

export class UserService {
  /**
   * Get all users
   * Only accessible by MANAGEMENT or ADMIN
   */
  async getAllUsers() {
    const users = await prisma.user.findMany({
      include: {
        roles: {
          include: {
            role: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return users.map(user => this.formatUser(user));
  }

  /**
   * Get user by ID
   * Users can view their own profile, MANAGEMENT/ADMIN can view any profile
   */
  async getUserById(userId: number, requestingUserId?: number, requestingUserRoles?: RoleName[]) {
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

    // Check if user is viewing their own profile or has MANAGEMENT/ADMIN role
    const isOwnProfile = requestingUserId === userId;
    const hasManagementAccess = requestingUserRoles?.some(role => 
      role === 'MANAGEMENT' || role === 'ADMIN'
    );

    if (!isOwnProfile && !hasManagementAccess) {
      throw new AppError('Access denied. You can only view your own profile.', 403);
    }

    return this.formatUser(user);
  }

  /**
   * Update user
   * Users can update their own profile (except roles), MANAGEMENT/ADMIN can update any user
   */
  async updateUser(
    userId: number,
    data: UpdateUserData,
    requestingUserId?: number,
    requestingUserRoles?: RoleName[]
  ) {
    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!existingUser) {
      throw new AppError('User not found', 404);
    }

    // Check permissions
    const isOwnProfile = requestingUserId === userId;
    const hasManagementAccess = requestingUserRoles?.some(role => 
      role === 'MANAGEMENT' || role === 'ADMIN'
    );

    if (!isOwnProfile && !hasManagementAccess) {
      throw new AppError('Access denied. You can only update your own profile.', 403);
    }

    // Regular users cannot update roles
    if (data.roles && !hasManagementAccess) {
      throw new AppError('Access denied. Only MANAGEMENT/ADMIN can update user roles.', 403);
    }

    // If email is being updated, check if it's already taken
    if (data.email && data.email !== existingUser.email) {
      const emailExists = await prisma.user.findUnique({
        where: { email: data.email }
      });

      if (emailExists) {
        throw new AppError('Email already in use', 409);
      }
    }

    // Prepare update data
    const updateData: any = {};
    
    if (data.email) updateData.email = data.email;
    if (data.name) updateData.name = data.name;
    
    if (data.password) {
      updateData.password = await hashPassword(data.password);
    }

    // Update roles if provided and user has permission
    if (data.roles && hasManagementAccess) {
      // Validate roles
      const validRoles = data.roles.filter(role => isRoleName(role));
      if (validRoles.length !== data.roles.length) {
        throw new AppError('Invalid roles provided', 400);
      }

      // Get role IDs
      const dbRoles = await prisma.role.findMany({
        where: {
          name: {
            in: validRoles
          }
        }
      });

      if (dbRoles.length !== validRoles.length) {
        const missing = validRoles.filter(
          (name) => !dbRoles.some((dbRole) => dbRole.name === name)
        );
        throw new AppError(`Invalid roles: ${missing.join(', ')}`, 400);
      }

      // Delete existing roles and create new ones
      await prisma.userRole.deleteMany({
        where: { userId }
      });

      updateData.roles = {
        create: dbRoles.map((dbRole) => ({
          role: {
            connect: { id: dbRole.id }
          }
        }))
      };
    }

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      include: {
        roles: {
          include: {
            role: true
          }
        }
      }
    });

    return this.formatUser(updatedUser);
  }

  /**
   * Delete user
   * Only accessible by ADMIN
   */
  async deleteUser(userId: number) {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Delete user (cascade will delete related records)
    await prisma.user.delete({
      where: { id: userId }
    });

    return { message: 'User deleted successfully' };
  }

  /**
   * Format user response (exclude password, format roles)
   */
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

  /**
   * Convert user roles to role names array
   */
  private toRoleNames(userRoles: Array<{ role: { name: string } | null }>): RoleName[] {
    return userRoles
      .map(({ role }) => role?.name)
      .filter((name): name is RoleName => isRoleName(name));
  }
}

export default new UserService();

