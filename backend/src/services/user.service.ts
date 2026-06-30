import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { hashPassword, comparePassword } from '../utils/password.util';
import { RoleName, ROLES, hasAnyRole } from '../constants/roles';
import { logger } from '../utils/logger';
import { getUserRolesWithNames, getUserRolesMapForUsers, formatUserWithRoles } from './userRoles.helper';
import { formatUser } from './userFormat.helper';
import { UserApprovalService } from './user.approval.service';
import { UserRoleService } from './user.role.service';

const approvalService = new UserApprovalService();
const roleService = new UserRoleService();

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
  // Delegates
  approveUser = (userId: number) =>
    approvalService.approveUser(userId);

  rejectUser = (userId: number, rejectionNote?: string) =>
    approvalService.rejectUser(userId, rejectionNote);

  unRejectUser = (userId: number) =>
    approvalService.unRejectUser(userId);

  getPendingRegistrations = () =>
    approvalService.getPendingRegistrations();

  getRejectedUsers = () =>
    approvalService.getRejectedUsers();

  getPendingRegistrationCount = () =>
    approvalService.getPendingRegistrationCount();

  getAllRoles = () =>
    roleService.getAllRoles();

  // Owns
  async getAllUsers(limit?: number, offset?: number) {
    const users = await prisma.user.findMany({
      orderBy: {
        createdAt: 'desc'
      },
      ...(limit !== undefined ? { take: limit } : {}),
      ...(offset !== undefined ? { skip: offset } : {}),
    });

    const userIds = users.map(u => u.id);
    const rolesMap = await getUserRolesMapForUsers(userIds);
    const formattedUsers = users.map(user => formatUser(formatUserWithRoles(user, rolesMap)));

    logger.info('Fetched users', {
      count: formattedUsers.length,
    });

    return formattedUsers;
  }

  async getUserById(userId: number, requestingUserId?: number, requestingUserRoles?: RoleName[]) {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    const isOwnProfile = requestingUserId === userId;
    const hasManagementAccess = hasAnyRole(requestingUserRoles, [ROLES.MANAGEMENT, ROLES.ADMIN]);

    if (!isOwnProfile && !hasManagementAccess) {
      throw new AppError('Access denied. You can only view your own profile.', 403);
    }

    const rolesWithNames = await getUserRolesWithNames(userId);
    return formatUser({
      ...user,
      roles: rolesWithNames
    });
  }

  async updateUser(
    userId: number,
    data: UpdateUserData,
    requestingUserId?: number,
    requestingUserRoles?: RoleName[]
  ) {
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

    const isOwnProfile = requestingUserId === userId;
    const hasManagementAccess = hasAnyRole(requestingUserRoles, [ROLES.MANAGEMENT, ROLES.ADMIN]);

    if (!isOwnProfile && !hasManagementAccess) {
      throw new AppError('Access denied. You can only update your own profile.', 403);
    }

    if (data.roles && !hasManagementAccess) {
      throw new AppError('Access denied. Only MANAGEMENT/ADMIN can update user roles.', 403);
    }

    const newUsername = data.username ? data.username.trim().toLowerCase() : undefined;
    if (newUsername && newUsername !== existingUser.username) {
      const usernameExists = await prisma.user.findFirst({
        where: { username: newUsername }
      });

      if (usernameExists) {
        throw new AppError('Username already in use', 409);
      }
    }

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

    if (data.roles !== undefined && hasManagementAccess) {
      // Validate roles
      const { isRoleName } = await import('../constants/roles');
      const validRoles = data.roles.filter(role => isRoleName(role));
      if (validRoles.length !== data.roles.length) {
        throw new AppError('Invalid roles provided', 400);
      }

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

      await prisma.userRole.deleteMany({
        where: { userId }
      });

      if (dbRoles.length > 0) {
        await prisma.userRole.createMany({
          data: dbRoles.map(dbRole => ({
            userId,
            roleId: dbRole.id
          }))
        });
      }

      if (validRoles.length === 0) {
        updateData.approved = false;
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData
    });

    const rolesWithNames = await getUserRolesWithNames(userId);
    const formattedUser = formatUser({
      ...updatedUser,
      roles: rolesWithNames
    });

    logger.info('User updated', {
      actorUserId: requestingUserId ?? null,
      targetUserId: userId,
      roles: formattedUser.roles,
      approved: formattedUser.approved ?? null,
      rejected: formattedUser.rejected ?? null,
    });

    return formattedUser;
  }

  async deleteUser(userId: number) {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    await prisma.user.delete({
      where: { id: userId }
    });

    logger.info('User deleted', {
      targetUserId: userId,
      username: user.username,
      approved: user.approved,
      rejected: user.rejected,
    });

    return { message: 'User deleted successfully' };
  }
}

export default new UserService();
