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
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Fetch user roles
    const userIds = users.map(u => u.id);
    const userRoles = await prisma.userRole.findMany({
      where: { userId: { in: userIds } }
    });

    const roleIds = [...new Set(userRoles.map(ur => ur.roleId))];
    const roles = await prisma.role.findMany({
      where: { id: { in: roleIds } }
    });
    const roleMap = new Map(roles.map(r => [r.id, r]));

    // Group roles by user
    const rolesByUser = new Map<number, Array<{ role: { name: string } | null }>>();
    for (const userRole of userRoles) {
      if (!rolesByUser.has(userRole.userId)) {
        rolesByUser.set(userRole.userId, []);
      }
      const role = roleMap.get(userRole.roleId);
      rolesByUser.get(userRole.userId)!.push({
        role: role ? { name: role.name } : null
      });
    }

    return users.map(user => this.formatUser({
      ...user,
      roles: rolesByUser.get(user.id) || []
    }));
  }

  /**
   * Get user by ID
   * Users can view their own profile, MANAGEMENT/ADMIN can view any profile
   */
  async getUserById(userId: number, requestingUserId?: number, requestingUserRoles?: RoleName[]) {
    const user = await prisma.user.findUnique({
      where: { id: userId }
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
      roles: rolesWithNames
    });
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

      // Create new user roles
      await prisma.userRole.createMany({
        data: dbRoles.map(dbRole => ({
          userId,
          roleId: dbRole.id
        }))
      });
    }

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData
    });

    // Fetch updated roles
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
      ...updatedUser,
      roles: rolesWithNames
    });
  }

  /**
   * Approve user (Admin only)
   */
  async approveUser(userId: number) {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    if (user.approved) {
      throw new AppError('User is already approved', 400);
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { approved: true }
    });

    // Fetch user roles for response
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
      ...updatedUser,
      roles: rolesWithNames
    });
  }

  /**
   * Reject user registration (Management/Admin only)
   * Marks user as rejected instead of deleting
   */
  async rejectUser(userId: number, rejectionNote?: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    if (user.approved) {
      throw new AppError('Cannot reject an approved user', 400);
    }

    if (user.rejected) {
      throw new AppError('User is already rejected', 400);
    }

    // Mark user as rejected instead of deleting
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { 
        rejected: true,
        rejectionNote: rejectionNote || null
      }
    });

    // Fetch user roles for response
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

    return {
      message: 'User registration rejected',
      user: this.formatUser({
        ...updatedUser,
        roles: rolesWithNames
      })
    };
  }

  /**
   * Get pending registrations (Admin/Management only)
   * Excludes rejected users
   */
  async getPendingRegistrations() {
    const users = await prisma.user.findMany({
      where: { 
        approved: false,
        rejected: false
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Fetch user roles
    const userIds = users.map(u => u.id);
    const userRoles = await prisma.userRole.findMany({
      where: { userId: { in: userIds } }
    });

    const roleIds = [...new Set(userRoles.map(ur => ur.roleId))];
    const roles = await prisma.role.findMany({
      where: { id: { in: roleIds } }
    });
    const roleMap = new Map(roles.map(r => [r.id, r]));

    // Group roles by user
    const rolesByUser = new Map<number, Array<{ role: { name: string } | null }>>();
    for (const userRole of userRoles) {
      if (!rolesByUser.has(userRole.userId)) {
        rolesByUser.set(userRole.userId, []);
      }
      const role = roleMap.get(userRole.roleId);
      rolesByUser.get(userRole.userId)!.push({
        role: role ? { name: role.name } : null
      });
    }

    return users.map(user => this.formatUser({
      ...user,
      roles: rolesByUser.get(user.id) || []
    }));
  }

  /**
   * Get rejected users (Admin only)
   */
  async getRejectedUsers() {
    const users = await prisma.user.findMany({
      where: { rejected: true },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Fetch user roles
    const userIds = users.map(u => u.id);
    const userRoles = await prisma.userRole.findMany({
      where: { userId: { in: userIds } }
    });

    const roleIds = [...new Set(userRoles.map(ur => ur.roleId))];
    const roles = await prisma.role.findMany({
      where: { id: { in: roleIds } }
    });
    const roleMap = new Map(roles.map(r => [r.id, r]));

    // Group roles by user
    const rolesByUser = new Map<number, Array<{ role: { name: string } | null }>>();
    for (const userRole of userRoles) {
      if (!rolesByUser.has(userRole.userId)) {
        rolesByUser.set(userRole.userId, []);
      }
      const role = roleMap.get(userRole.roleId);
      rolesByUser.get(userRole.userId)!.push({
        role: role ? { name: role.name } : null
      });
    }

    return users.map(user => this.formatUser({
      ...user,
      roles: rolesByUser.get(user.id) || []
    }));
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
   * Get all roles from database
   */
  async getAllRoles() {
    const roles = await prisma.role.findMany({
      orderBy: {
        name: 'asc'
      }
    });

    return roles.map(role => role.name);
  }

  /**
   * Format user response (exclude password, format roles)
   */
  private formatUser<T extends { id: number; email: string; name: string; address?: string | null; cashapp?: string | null; phoneNumber?: string | null; approved?: boolean; rejected?: boolean; rejectionNote?: string | null; createdAt: Date; updatedAt?: Date; roles: Array<{ role: { name: string } | null }> }>(user: T) {
    const { id, email, name, address, cashapp, phoneNumber, approved, rejected, rejectionNote, createdAt, updatedAt } = user;
    return {
      id,
      email,
      name,
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

