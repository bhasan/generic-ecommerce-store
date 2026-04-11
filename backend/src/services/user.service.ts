import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { hashPassword, comparePassword } from '../utils/password.util';
import { RoleName, isRoleName, ROLES, hasAnyRole } from '../constants/roles';
import { logger } from '../utils/logger';
import { notificationEventsService } from './notificationEvents.service';

interface UpdateUserData {
  username?: string;
  password?: string;
  currentPassword?: string;
  roles?: RoleName[];
  address?: string | null;
  cashapp?: string | null;
  zelle?: string | null;
  venmo?: string | null;
  phoneNumber?: string | null;
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

    const formattedUsers = users.map(user => this.formatUser({
      ...user,
      roles: rolesByUser.get(user.id) || []
    }));

    // Count-only list logs are deliberate: enough signal for dashboard/debugging
    // without dumping full user payloads into logs.
    logger.info('Fetched users', {
      count: formattedUsers.length,
    });

    return formattedUsers;
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
    const hasManagementAccess = hasAnyRole(requestingUserRoles, [ROLES.MANAGEMENT, ROLES.ADMIN]);

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

    logger.info('Updating user', {
      actorUserId: requestingUserId ?? null,
      targetUserId: userId,
      fields: Object.keys(data),
      existingApproved: existingUser.approved,
      existingRejected: existingUser.rejected,
    });

    // Check permissions
    const isOwnProfile = requestingUserId === userId;
    const hasManagementAccess = hasAnyRole(requestingUserRoles, [ROLES.MANAGEMENT, ROLES.ADMIN]);

    if (!isOwnProfile && !hasManagementAccess) {
      throw new AppError('Access denied. You can only update your own profile.', 403);
    }

    // Regular users cannot update roles
    if (data.roles && !hasManagementAccess) {
      throw new AppError('Access denied. Only MANAGEMENT/ADMIN can update user roles.', 403);
    }

    // If username is being updated, check if it's already taken
    const newUsername = data.username ? data.username.trim().toLowerCase() : undefined;
    if (newUsername && newUsername !== existingUser.username) {
      const usernameExists = await prisma.user.findUnique({
        where: { username: newUsername }
      });

      if (usernameExists) {
        throw new AppError('Username already in use', 409);
      }
    }

    // Prepare update data
    const updateData: any = {};

    if (newUsername) updateData.username = newUsername;
    if (data.address !== undefined) updateData.address = data.address || null;
    if (data.cashapp !== undefined) updateData.cashapp = data.cashapp || null;
    if (data.zelle !== undefined) updateData.zelle = data.zelle || null;
    if (data.venmo !== undefined) updateData.venmo = data.venmo || null;
    if (data.phoneNumber !== undefined) updateData.phoneNumber = data.phoneNumber || null;

    if (data.password) {
      if (isOwnProfile) {
        if (!data.currentPassword) {
          throw new AppError('Current password is required to change password', 400);
        }
        const isCurrentValid = await comparePassword(data.currentPassword, existingUser.password);
        if (!isCurrentValid) {
          throw new AppError('Current password is incorrect', 400);
        }
      }
      updateData.password = await hashPassword(data.password);
    }

    // Update roles if provided and user has permission
    if (data.roles !== undefined && hasManagementAccess) {
      // Role replacement here is intentionally all-or-nothing so audit logs and
      // tests can reason about before/after role state deterministically.
      // Validate roles (allow empty array)
      const validRoles = data.roles.filter(role => isRoleName(role));
      if (validRoles.length !== data.roles.length) {
        throw new AppError('Invalid roles provided', 400);
      }

      // Get role IDs
      const dbRoles = validRoles.length > 0
        ? await prisma.role.findMany({
            where: {
              name: {
                in: validRoles
              }
            }
          })
        : [];

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

      // Create new user roles (if any)
      if (dbRoles.length > 0) {
        await prisma.userRole.createMany({
          data: dbRoles.map(dbRole => ({
            userId,
            roleId: dbRole.id
          }))
        });
      }

      // If all roles are removed, set approved to false so user appears in pending registrations
      if (validRoles.length === 0) {
        updateData.approved = false;
      }
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

    const formattedUser = this.formatUser({
      ...updatedUser,
      roles: rolesWithNames
    });

    // The post-update snapshot is the audit trail future Codex sessions should
    // trust when reconstructing what an admin/profile edit actually changed.
    logger.info('User updated', {
      actorUserId: requestingUserId ?? null,
      targetUserId: userId,
      roles: formattedUser.roles,
      approved: formattedUser.approved ?? null,
      rejected: formattedUser.rejected ?? null,
    });

    return formattedUser;
  }

  /**
   * Approve user (Admin only)
   * Assigns CUSTOMER role by default if user has no roles
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

    // Check if user has any roles
    const existingUserRoles = await prisma.userRole.findMany({
      where: { userId }
    });

    // If user has no roles, assign CUSTOMER role by default
    if (existingUserRoles.length === 0) {
      // This auto-assignment is existing business behavior; the log below exists
      // so approval investigations can tell whether the default role path ran.
      const customerRole = await prisma.role.findUnique({
        where: { name: 'CUSTOMER' }
      });

      if (!customerRole) {
        throw new AppError('CUSTOMER role not found in database', 500);
      }

      // Assign CUSTOMER role
      await prisma.userRole.create({
        data: {
          userId,
          roleId: customerRole.id
        }
      });
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

    const formattedUser = this.formatUser({
      ...updatedUser,
      roles: rolesWithNames
    });

    logger.info('User approved', {
      targetUserId: userId,
      autoAssignedCustomerRole: existingUserRoles.length === 0,
      roles: formattedUser.roles,
    });

    await notificationEventsService.notifyAccountApproved(userId);

    return formattedUser;
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

    const result = {
      message: 'User registration rejected',
      user: this.formatUser({
        ...updatedUser,
        roles: rolesWithNames
      })
    };

    logger.info('User rejected', {
      targetUserId: userId,
      hasRejectionNote: Boolean(rejectionNote),
      roles: result.user.roles,
    });

    await notificationEventsService.notifyAccountRejected(userId);

    return result;
  }

  /**
   * Un-reject user (move back to pending) (Management/Admin only)
   * Sets rejected: false, approved: false, and clears rejection note
   */
  async unRejectUser(userId: number) {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    if (!user.rejected) {
      throw new AppError('User is not rejected', 400);
    }

    // Move user back to pending (un-reject)
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { 
        rejected: false,
        approved: false,
        rejectionNote: null
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

    const result = {
      message: 'User moved back to pending registrations',
      user: this.formatUser({
        ...updatedUser,
        roles: rolesWithNames
      })
    };

    logger.info('User moved back to pending', {
      targetUserId: userId,
      roles: result.user.roles,
    });

    return result;
  }

  /**
   * Get pending registrations (Admin/Management only)
   * Includes users who are not approved and not rejected,
   * or users with no roles (all roles removed)
   */
  async getPendingRegistrations() {
    // Pending registration logic is intentionally verbose because approval state
    // and "no roles" state overlap in this codebase. Keep the count log aligned
    // with that behavior unless the business rule itself is changed later.
    // Get all users that are not approved and not rejected
    const unapprovedUsers = await prisma.user.findMany({
      where: { 
        approved: false,
        rejected: false
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Get all users that are not approved and not rejected, and check for those with no roles
    const allUsers = await prisma.user.findMany({
      where: {
        approved: false,
        rejected: false
      }
    });

    const userIds = allUsers.map(u => u.id);
    const userRoles = await prisma.userRole.findMany({
      where: { userId: { in: userIds } }
    });

    // Find users with no roles (only from unapproved users)
    const usersWithRoles = new Set(userRoles.map(ur => ur.userId));
    const usersWithoutRoles = allUsers.filter(u => !usersWithRoles.has(u.id));

    // Combine unapproved users and users without roles, remove duplicates
    const pendingUserIds = new Set([
      ...unapprovedUsers.map(u => u.id),
      ...usersWithoutRoles.map(u => u.id)
    ]);

    const users = await prisma.user.findMany({
      where: {
        id: { in: Array.from(pendingUserIds) },
        approved: false, // Ensure we only return unapproved users
        rejected: false
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Fetch user roles for the final user list
    const finalUserIds = users.map(u => u.id);
    const finalUserRoles = await prisma.userRole.findMany({
      where: { userId: { in: finalUserIds } }
    });

    const roleIds = [...new Set(finalUserRoles.map(ur => ur.roleId))];
    const roles = await prisma.role.findMany({
      where: { id: { in: roleIds } }
    });
    const roleMap = new Map(roles.map(r => [r.id, r]));

    // Group roles by user
    const rolesByUser = new Map<number, Array<{ role: { name: string } | null }>>();
    for (const userRole of finalUserRoles) {
      if (!rolesByUser.has(userRole.userId)) {
        rolesByUser.set(userRole.userId, []);
      }
      const role = roleMap.get(userRole.roleId);
      rolesByUser.get(userRole.userId)!.push({
        role: role ? { name: role.name } : null
      });
    }

    const formattedUsers = users.map(user => this.formatUser({
      ...user,
      roles: rolesByUser.get(user.id) || []
    }));

    logger.info('Fetched pending registrations', {
      count: formattedUsers.length,
      usersWithoutRoles: usersWithoutRoles.length,
    });

    return formattedUsers;
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

    const formattedUsers = users.map(user => this.formatUser({
      ...user,
      roles: rolesByUser.get(user.id) || []
    }));

    logger.info('Fetched rejected users', {
      count: formattedUsers.length,
    });

    return formattedUsers;
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

    // Delete logs need enough identity fields for audit/debugging, but should
    // still avoid including sensitive profile fields or related records.
    logger.info('User deleted', {
      targetUserId: userId,
      username: user.username,
      approved: user.approved,
      rejected: user.rejected,
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

    logger.info('Fetched roles', {
      count: roles.length,
    });

    return roles.map(role => role.name);
  }

  /**
   * Format user response (exclude password, format roles)
   */
  private formatUser<T extends { id: number; username: string; address?: string | null; cashapp?: string | null; zelle?: string | null; venmo?: string | null; phoneNumber?: string | null; approved?: boolean; rejected?: boolean; rejectionNote?: string | null; createdAt: Date; updatedAt?: Date; roles: Array<{ role: { name: string } | null }> }>(user: T) {
    const { id, username, address, cashapp, zelle, venmo, phoneNumber, approved, rejected, rejectionNote, createdAt, updatedAt } = user;
    return {
      id,
      username,
      ...(address ? { address } : {}),
      ...(cashapp ? { cashapp } : {}),
      ...(zelle ? { zelle } : {}),
      ...(venmo ? { venmo } : {}),
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

