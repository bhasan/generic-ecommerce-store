import prisma from '../config/database';
import {
  NotificationCategory,
  NotificationDeliveryStatus,
  NotificationEntityType,
  NotificationType,
  OrderStatus,
} from '../../generated/prisma';
import { RoleName } from '../constants/roles';
import { logger } from '../utils/logger';

const UNFULFILLED_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.APPROVED,
  OrderStatus.NOT_FULFILLING,
  OrderStatus.READY_FOR_DELIVERY,
  OrderStatus.OUT_FOR_DELIVERY,
];

export interface NotificationMetadata {
  orderId?: number;
  status?: string;
  previousStatus?: string | null;
  path?: string;
  section?: string;
  label?: string;
  userId?: number;
  contactMessageId?: number;
  [key: string]: string | number | boolean | null | undefined;
}

export interface NotificationInput {
  type: NotificationType;
  category: NotificationCategory;
  title: string;
  message: string;
  recipientUserIds?: number[];
  recipientRoles?: RoleName[];
  metadata?: NotificationMetadata;
  sourceEntityType?: NotificationEntityType;
  sourceEntityId?: number;
  requiresAttention?: boolean;
}

export interface NotificationListOptions {
  unreadOnly?: boolean;
  limit?: number;
}

export class NotificationService {
  /**
   * Get staff notification counts: orders by status + pending registrations
   */
  async getStaffNotificationCounts(): Promise<{
    ordersByStatus: Record<string, number>;
    pendingRegistrations: number;
  }> {
    // Dynamic import breaks the circular dependency chain:
    // notification.service → user.service → notificationEvents.service → notification.service
    const userServiceModule = await import('./user.service');
    const userSvc = userServiceModule.default;

    const [orderGroups, pendingRegistrations] = await Promise.all([
      prisma.order.groupBy({
        by: ['status'],
        _count: { status: true },
        where: { status: { in: UNFULFILLED_STATUSES } }
      }),
      userSvc.getPendingRegistrationCount(),
    ]);

    const ordersByStatus: Record<string, number> = {};
    for (const status of UNFULFILLED_STATUSES) {
      ordersByStatus[status] = 0;
    }
    for (const g of orderGroups) {
      if (g.status) {
        ordersByStatus[g.status] = g._count.status;
      }
    }

    logger.info('Staff notification counts computed', {
      ordersByStatus,
      pendingRegistrations,
    });

    return {
      ordersByStatus,
      pendingRegistrations
    };
  }

  async listForUser(recipientUserId: number, options: NotificationListOptions = {}) {
    const limit = Math.min(Math.max(options.limit ?? 25, 1), 100);
    const notifications = await prisma.notification.findMany({
      where: {
        recipientUserId,
        ...(options.unreadOnly ? { readAt: null } : {}),
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });

    return notifications;
  }

  async getUnreadCount(recipientUserId: number) {
    const count = await prisma.notification.count({
      where: {
        recipientUserId,
        readAt: null,
      },
    });

    return { count };
  }

  async markAsRead(notificationId: number, recipientUserId: number) {
    const notification = await prisma.notification.updateMany({
      where: {
        id: notificationId,
        recipientUserId,
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });

    return { updated: notification.count > 0 };
  }

  async markAllAsRead(recipientUserId: number) {
    const result = await prisma.notification.updateMany({
      where: {
        recipientUserId,
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });

    return { updated: result.count };
  }

  async createNotifications(input: NotificationInput) {
    const recipientUserIds = await this.resolveRecipientUserIds(
      input.recipientUserIds ?? [],
      input.recipientRoles ?? [],
    );

    if (recipientUserIds.length === 0) {
      logger.warn('Notification skipped because no recipients were resolved', {
        type: input.type,
        category: input.category,
        sourceEntityType: input.sourceEntityType ?? null,
        sourceEntityId: input.sourceEntityId ?? null,
      });
      return [];
    }

    const records = await Promise.all(
      recipientUserIds.map((recipientUserId) => prisma.notification.create({
        data: {
          recipientUserId,
          type: input.type,
          category: input.category,
          title: input.title,
          message: input.message,
          metadata: input.metadata,
          sourceEntityType: input.sourceEntityType,
          sourceEntityId: input.sourceEntityId,
          requiresAttention: input.requiresAttention ?? false,
        },
      }))
    );

    logger.info('Notifications created', {
      type: input.type,
      category: input.category,
      recipientCount: records.length,
      requiresAttention: input.requiresAttention ?? false,
      sourceEntityType: input.sourceEntityType ?? null,
      sourceEntityId: input.sourceEntityId ?? null,
    });

    return records;
  }

  async updateDeliveryStatus(
    notificationIds: number[],
    status: NotificationDeliveryStatus,
  ) {
    if (notificationIds.length === 0) return;

    await prisma.notification.updateMany({
      where: {
        id: { in: notificationIds },
      },
      data: {
        deliveryStatus: status,
        ...(status === NotificationDeliveryStatus.DELIVERED ? { deliveredAt: new Date() } : {}),
      },
    });
  }

  async getRecipientRolesForUsers(userIds: number[], candidateRoles: RoleName[]) {
    const rolesByUser = new Map<number, RoleName[]>();
    if (userIds.length === 0 || candidateRoles.length === 0) {
      return rolesByUser;
    }

    const roles = await prisma.role.findMany({
      where: {
        name: {
          in: candidateRoles,
        },
      },
    });

    if (roles.length === 0) {
      return rolesByUser;
    }

    const roleIdToName = new Map<number, RoleName>(roles.map((role) => [role.id, role.name as RoleName]));
    const assignments = await prisma.userRole.findMany({
      where: {
        userId: { in: userIds },
        roleId: { in: roles.map((role) => role.id) },
      },
      select: {
        userId: true,
        roleId: true,
      },
    });

    for (const assignment of assignments) {
      const roleName = roleIdToName.get(assignment.roleId);
      if (!roleName) continue;
      const currentRoles = rolesByUser.get(assignment.userId) ?? [];
      if (!currentRoles.includes(roleName)) {
        currentRoles.push(roleName);
      }
      rolesByUser.set(assignment.userId, currentRoles);
    }

    return rolesByUser;
  }

  private async resolveRecipientUserIds(
    directRecipientUserIds: number[],
    recipientRoles: RoleName[],
  ) {
    const uniqueIds = new Set<number>(directRecipientUserIds);

    if (recipientRoles.length > 0) {
      const roles = await prisma.role.findMany({
        where: {
          name: {
            in: recipientRoles,
          },
        },
      });

      if (roles.length > 0) {
        const roleAssignments = await prisma.userRole.findMany({
          where: {
            roleId: { in: roles.map((role) => role.id) },
          },
        });

        const candidateUserIds = [...new Set(roleAssignments.map((assignment) => assignment.userId))];
        if (candidateUserIds.length > 0) {
          const approvedUsers = await prisma.user.findMany({
            where: {
              id: { in: candidateUserIds },
              approved: true,
              rejected: false,
            },
            select: { id: true },
          });

          for (const user of approvedUsers) {
            uniqueIds.add(user.id);
          }
        }
      }
    }

    return [...uniqueIds];
  }
}

export const notificationService = new NotificationService();
