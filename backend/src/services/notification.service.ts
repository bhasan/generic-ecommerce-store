import prisma from '../config/database';
import { OrderStatus } from '../../generated/prisma';

const UNFULFILLED_STATUSES: OrderStatus[] = [
  'PENDING',
  'APPROVED',
  'NOT_FULFILLING',
  'READY_FOR_DELIVERY',
  'OUT_FOR_DELIVERY'
];

export class NotificationService {
  /**
   * Get staff notification counts: orders by status + pending registrations
   */
  async getStaffNotificationCounts(): Promise<{
    ordersByStatus: Record<string, number>;
    pendingRegistrations: number;
  }> {
    const [orderGroups, pendingRegistrations] = await Promise.all([
      prisma.order.groupBy({
        by: ['status'],
        _count: { status: true },
        where: { status: { in: UNFULFILLED_STATUSES } }
      }),
      prisma.user.count({
        where: { approved: false, rejected: false }
      })
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

    return {
      ordersByStatus,
      pendingRegistrations
    };
  }
}

export const notificationService = new NotificationService();
