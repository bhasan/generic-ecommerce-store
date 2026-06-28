import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { OrderStatus, PaymentStatus } from '../../generated/prisma';
import { RoleName, hasAnyRole, ROLES } from '../constants/roles';
import { DeliveryMethod } from '../constants/orderMethods';
import { logger } from '../utils/logger';
import { PaymentMethodEnum } from '../../generated/prisma';
import { enqueue } from './pos/orders/posOrderService';
import { getOrderSync } from './pos/registry';
import { StoreSettingsService } from './storeSettings.service';
import { thermalPrinterService } from './thermalPrinter.service';
import { shapeOrderItem, shapeStatusEvents, shapePayments } from './orderResponseShaper';
import eventBus from './event-bus.service';

export interface UpdateOrderStatusData {
  status: OrderStatus;
  changedBy?: number;
  note?: string;
}

export interface PrintOrderReceiptData {
  actor?: {
    userId?: number | null;
    username?: string | null;
  };
}

// Single source for side-effects fired when order status changes.
// Used by updateOrderStatus and customerArrive.
export async function dispatchOrderStatusUpdatedEffects(
  orderId: number,
  userId: number,
  newStatus: string,
  previousStatus: string,
): Promise<void> {
  eventBus.publish('order.status_changed', { orderId, userId, newStatus, previousStatus });
}

export class OrderFulfillmentService {
  /**
   * Update order status
   * Management/Admin can update to any status
   * Delivery Driver can only update to DELIVERED
   */
  async updateOrderStatus(orderId: number, data: UpdateOrderStatusData, userRoles?: RoleName[]) {
    logger.info('Updating order status', {
      orderId,
      newStatus: data.status,
      userRoles,
    });

    try {
      const order = await prisma.order.findUnique({ where: { id: orderId } });

      if (!order) {
        logger.warn('Order status update failed: order not found', { orderId });
        throw new AppError('Order not found', 404);
      }

      logger.debug('Order found for status update', {
        orderId,
        currentStatus: order.status,
        newStatus: data.status,
        userId: order.userId,
      });

      // Check if user is delivery driver trying to set status other than DELIVERED
      if (userRoles && hasAnyRole(userRoles, [ROLES.DELIVERY_DRIVER]) && !hasAnyRole(userRoles, [ROLES.EMPLOYEE, ROLES.MANAGEMENT, ROLES.ADMIN])) {
        if (data.status !== OrderStatus.DELIVERED) {
          logger.warn('Order status update denied: delivery driver trying to set non-DELIVERED status', {
            orderId,
            attemptedStatus: data.status,
            userRoles,
          });
          throw new AppError('Delivery drivers can only mark orders as DELIVERED', 403);
        }
        // Delivery drivers can only mark READY_FOR_DELIVERY orders as DELIVERED
        const deliverableFrom: OrderStatus[] = [OrderStatus.READY_FOR_DELIVERY, OrderStatus.OUT_FOR_DELIVERY];
        if (!deliverableFrom.includes(order.status as OrderStatus)) {
          logger.warn('Order status update denied: order is not in a deliverable state', {
            orderId,
            currentStatus: order.status,
            attemptedStatus: data.status,
          });
          throw new AppError('Can only mark orders that are ready for or out for delivery as DELIVERED', 400);
        }
      }

      logger.info('Updating order status in database', {
        orderId,
        oldStatus: order.status,
        newStatus: data.status,
      });

      const posSettings = await new StoreSettingsService().getStoreSettings();
      const posSync = getOrderSync(posSettings);

      const updatedOrder = await prisma.$transaction(async (tx) => {
        const updated = await tx.order.update({
          where: { id: orderId },
          data: { status: data.status },
        });
        await tx.orderStatusEvent.create({
          data: {
            orderId,
            fromStatus: order.status,
            toStatus: data.status,
            changedBy: data.changedBy ?? null,
            note: data.note ?? null,
          },
        });

        if (data.status === OrderStatus.APPROVED && order.paymentMethod === PaymentMethodEnum.EXTERNAL) {
          await tx.payment.updateMany({
            where: { orderId, status: PaymentStatus.PENDING },
            data: { status: PaymentStatus.SETTLED },
          });
        }

        if (posSync && posSettings.posProvider) {
          if (data.status === OrderStatus.APPROVED) {
            await enqueue(tx, orderId, 'ORDER_CREATED', posSettings.posProvider);
          } else if (posSync.shouldPushStatus(data.status)) {
            await enqueue(tx, orderId, 'ORDER_UPDATED', posSettings.posProvider);
          }
        }

        return updated;
      });

      logger.info('Order status updated in database', {
        orderId,
        oldStatus: order.status,
        newStatus: updatedOrder.status,
        updatedAt: updatedOrder.updatedAt,
      });

      // Fetch order items with variant/product info
      const orderItems = await prisma.orderItem.findMany({
        where: { orderId },
        include: { variant: { include: { product: { include: { images: true } } } } },
      });

      const itemsWithProducts = orderItems.map(shapeOrderItem);

      logger.info('Order status update completed successfully', {
        orderId,
        oldStatus: order.status,
        newStatus: updatedOrder.status,
        itemCount: itemsWithProducts.length,
      });

      await dispatchOrderStatusUpdatedEffects(orderId, order.userId, updatedOrder.status, order.status);

      const fullUpdated = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          statusEvents: { orderBy: { createdAt: 'asc' } },
          payments: true,
        },
      });

      return {
        ...updatedOrder,
        items: itemsWithProducts,
        statusEvents: shapeStatusEvents(fullUpdated?.statusEvents ?? []),
        payments: shapePayments(fullUpdated?.payments ?? []),
      };
    } catch (error) {
      logger.error('Failed to update order status', error, {
        orderId,
        newStatus: data.status,
        userRoles,
      });
      throw error;
    }
  }

  // Builds and dispatches a manual reprint request while preserving actor metadata for audit history.
  async printOrderReceipt(orderId: number, data: PrintOrderReceiptData = {}) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true },
    });

    if (!order) {
      throw new AppError('Order not found', 404);
    }

    return thermalPrinterService.dispatchReceipt(orderId, 'MANUAL_REPRINT', data.actor);
  }

  /**
   * Mark order as arrived (Customer check-in for Curbside)
   */
  async customerArrive(orderId: number, userId: number, parkingSpot: string) {
    logger.info('Customer notifying arrival for curbside order', {
      orderId,
      userId,
      parkingSpot,
    });

    try {
      const order = await prisma.order.findUnique({
        where: { id: orderId }
      });

      if (!order) {
        throw new AppError('Order not found', 404);
      }

      if (order.userId !== userId) {
        throw new AppError('Access denied', 403);
      }

      if (order.deliveryMethod !== DeliveryMethod.CURBSIDE) {
        throw new AppError('Arrival notification is only available for curbside orders', 400);
      }

      if (order.status !== OrderStatus.READY_FOR_PICKUP) {
        throw new AppError('Order must be in READY_FOR_PICKUP status to check in', 400);
      }

      // Update order status to ARRIVED and append parking spot to deliveryAddress
      const baseAddress = order.deliveryAddress || 'CURBSIDE';
      const updatedAddress = `${baseAddress} | SPOT: ${parkingSpot.trim()}`;

      logger.info('Updating order status to ARRIVED in database', {
        orderId,
        updatedAddress,
      });

      const posSettings = await new StoreSettingsService().getStoreSettings();
      const posSync = getOrderSync(posSettings);

      // Status write and the POS outbox enqueue must be atomic — same guarantee as updateOrderStatus.
      const updatedOrder = await prisma.$transaction(async (tx) => {
        const updated = await tx.order.update({
          where: { id: orderId },
          data: {
            status: OrderStatus.ARRIVED,
            deliveryAddress: updatedAddress,
            parkingSpot: parkingSpot.trim(),
          }
        });
        if (posSync && posSettings.posProvider && posSync.shouldPushStatus(OrderStatus.ARRIVED)) {
          await enqueue(tx, orderId, 'ORDER_UPDATED', posSettings.posProvider);
        }
        return updated;
      });

      // Fetch order items with variant/product info
      const orderItems = await prisma.orderItem.findMany({
        where: { orderId },
        include: { variant: { include: { product: { include: { images: true } } } } },
      });
      const itemsWithProducts = orderItems.map(shapeOrderItem);

      // Trigger notification updates (non-transactional side effects)
      await dispatchOrderStatusUpdatedEffects(orderId, order.userId, OrderStatus.ARRIVED, order.status);

      return {
        ...updatedOrder,
        items: itemsWithProducts
      };
    } catch (error) {
      logger.error('Failed customer arrive update', error, { orderId, userId });
      throw error;
    }
  }
}
