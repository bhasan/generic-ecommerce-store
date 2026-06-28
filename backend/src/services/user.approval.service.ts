import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import { notificationEventsService } from './notificationEvents.service';
import { formatUser } from './userFormat.helper';

export class UserApprovalService {
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

    const formattedUser = formatUser({
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
      user: formatUser({
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
      user: formatUser({
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
        approved: false,
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

    const formattedUsers = users.map(user => formatUser({
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

    const formattedUsers = users.map(user => formatUser({
      ...user,
      roles: rolesByUser.get(user.id) || []
    }));

    logger.info('Fetched rejected users', {
      count: formattedUsers.length,
    });

    return formattedUsers;
  }

  /**
   * Get the count of users pending registration approval.
   */
  async getPendingRegistrationCount(): Promise<number> {
    return prisma.user.count({ where: { approved: false, rejected: false } });
  }
}
