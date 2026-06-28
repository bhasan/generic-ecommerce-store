import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { OrderStatus, Prisma, PaymentStatus } from '../../generated/prisma';
import { resolveUnitPrice, isQuantityAllowed } from './pricing';
import { RoleName, hasAnyRole, ROLES } from '../constants/roles';
import { DEFAULT_TAX_RATE } from '../constants/settings';
import { DeliveryMethod, PaymentMethod } from '../constants/orderMethods';
import { logger } from '../utils/logger';
import { StructuredDeliveryAddress } from '../utils/address.util';
import { getPaymentStrategy } from './payments/registry';
import { getFulfillmentStrategy } from './fulfillment/registry';
import { PaymentMethodEnum, DeliveryMethodEnum } from '../../generated/prisma';
import { enqueue } from './pos/orders/posOrderService';
import { getOrderSync } from './pos/registry';
import { StoreSettingsService } from './storeSettings.service';
import eventBus from './event-bus.service';
import { thermalPrinterService } from './thermalPrinter.service';
import { shapeOrderItem, shapeStatusEvents, shapePayments } from './orderResponseShaper';

// Resolves the Authorize.net communicator.html callback URL from server config only.
// Never uses client-supplied values — the Origin header is attacker-controlled and
// accepting it would let an adversary redirect the payment callback to their domain.
function resolveCommunicatorUrl(): string {
  const corsOrigin = process.env.CORS_ORIGIN;
  if (!corsOrigin) {
    throw new AppError(
      'Card payments are unavailable: CORS_ORIGIN is not configured',
      503
    );
  }
  return `${corsOrigin}/communicator.html`;
}

interface CreateOrderData {
  userId: number;
  items: Array<{
    variantId: number;
    quantity: number;
  }>;
  cashAppUsername?: string;
  deliveryMethod: typeof DeliveryMethod[keyof typeof DeliveryMethod];
  /** For DELIVERY orders. */
  deliveryAddress?: StructuredDeliveryAddress;
  /** For CURBSIDE orders — free-form display string (e.g. "Silver Toyota Camry"). */
  vehicleDescription?: string;
  paymentMethod?: typeof PaymentMethod[keyof typeof PaymentMethod];
}

interface UpdateOrderStatusData {
  status: OrderStatus;
  changedBy?: number;
  note?: string;
}

interface AddOrderItemData {
  variantId: number;
  quantity: number;
}

interface PrintOrderReceiptData {
  actor?: {
    userId?: number | null;
    username?: string | null;
  };
}

async function decrementStockGuarded(
  tx: Prisma.TransactionClient,
  variantId: number,
  quantity: number,
  productName: string,
): Promise<void> {
  const result = await tx.productVariant.updateMany({
    where: { id: variantId, stock: { gte: quantity } },
    data: { stock: { decrement: quantity } },
  });
  if (result.count === 0) {
    throw new AppError(`Insufficient stock for ${productName}`, 400);
  }
}

// Single source for the notify+print side-effects fired when an order becomes active.
// Used by createOrder (non-CC) and confirmCardPayment (CC, deferred until payment confirmed).
async function dispatchOrderCreatedEffects(orderId: number, userId: number): Promise<void> {
  eventBus.publish('order.placed', { orderId, userId });
}

// Single source for side-effects fired when order status changes.
// Used by updateOrderStatus and customerArrive.
async function dispatchOrderStatusUpdatedEffects(
  orderId: number,
  userId: number,
  newStatus: string,
  previousStatus: string,
): Promise<void> {
  eventBus.publish('order.status_changed', { orderId, userId, newStatus, previousStatus });
}

// Orders now carry their items via relations; one include shape feeds every read path.
const sumOrderItems = (items: { unitPrice: Prisma.Decimal; quantity: number; voided?: boolean }[]) =>
  items
    .filter((item) => !item.voided)
    .reduce((sum, item) => sum.add(item.unitPrice.mul(item.quantity)), new Prisma.Decimal(0));

const orderItemsInclude = {
  items: {
    orderBy: { id: 'asc' as const },
    include: { variant: { include: { product: { include: { images: true } } } } },
  },
};

const orderItemsListInclude = {
  items: {
    orderBy: { id: 'asc' as const },
    select: {
      id: true,
      variantId: true,
      productName: true,
      variantLabel: true,
      quantity: true,
      unitPrice: true,
      voided: true,
      addedAfterSubmission: true,
    },
  },
};

export class OrderService {
  /**
   * Get all orders (with user filtering for customers)
   * @param limit  Optional max number of orders to return
   * @param offset Optional number of orders to skip (for pagination)
   */
  // Returns all visible orders, scoped to the current user unless the caller has staff or driver roles.
  async getAllOrders(userId: number, userRoles: RoleName[], limit?: number, offset?: number) {
    const isCustomerScoped = !hasAnyRole(userRoles, [ROLES.EMPLOYEE, ROLES.MANAGEMENT, ROLES.ADMIN, ROLES.DELIVERY_DRIVER]);
    const where = isCustomerScoped ? { userId } : {};

    logger.info('Retrieving orders from database', {
      userId,
      userRoles,
      isCustomerScoped,
      filter: where,
    });

    try {
      const orders = await prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, username: true, phoneNumber: true, address: true } },
          ...orderItemsListInclude,
        },
        ...(limit !== undefined && { take: limit }),
        ...(offset !== undefined && { skip: offset }),
      });

      const result = orders.map((order) => ({
        ...order,
        items: order.items.map(shapeOrderItem),
      }));

      logger.info('Orders retrieval completed', {
        userId,
        totalOrders: result.length,
      });

      return result;
    } catch (error) {
      logger.error('Failed to retrieve orders from database', error, {
        userId,
        userRoles,
        filter: where,
      });
      throw error;
    }
  }

  /**
   * Get delivered orders (latest first)
   */
  // Returns delivered orders enriched with user and item snapshots for delivery-history style views.
  async getDeliveredOrders() {
    const orders = await prisma.order.findMany({
      where: { status: 'DELIVERED' },
      orderBy: { updatedAt: 'desc' },
      include: {
        user: { select: { id: true, username: true, address: true, phoneNumber: true } },
        ...orderItemsInclude,
      },
    });

    return orders.map((order) => ({
      ...order,
      items: order.items.map(shapeOrderItem),
    }));
  }

  /**
   * Get out-for-delivery orders (for delivery drivers)
   */
  // Returns orders currently out for delivery with attached user and item details for driver/staff tracking.
  async getOutForDeliveryOrders() {
    return this.getOrdersByStatusForDrivers('OUT_FOR_DELIVERY');
  }

  /**
   * Get ready-for-delivery orders (for delivery drivers)
   */
  // Returns orders ready for delivery with enough related data for dispatching and handoff screens.
  async getReadyForDeliveryOrders() {
    return this.getOrdersByStatusForDrivers('READY_FOR_DELIVERY');
  }

  // Shared driver/staff list: orders in a status, oldest first, with user + item snapshots.
  private async getOrdersByStatusForDrivers(status: OrderStatus) {
    const orders = await prisma.order.findMany({
      where: { status },
      orderBy: { createdAt: 'asc' },
      include: {
        user: { select: { id: true, username: true, address: true, phoneNumber: true } },
        ...orderItemsInclude,
      },
    });

    return orders.map((order) => ({
      ...order,
      items: order.items.map(shapeOrderItem),
    }));
  }

  /**
   * Get single order by ID
   */
  // Returns one order with role-aware access control and the related user/item data needed by detail views.
  async getOrderById(orderId: number, userId: number, userRoles: RoleName[]) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: { select: { id: true, username: true, phoneNumber: true, address: true } },
        ...orderItemsInclude,
        statusEvents: { orderBy: { createdAt: 'asc' } },
        payments: true,
      },
    });

    if (!order) {
      throw new AppError('Order not found', 404);
    }

    // Customers can only view their own orders
    if (!hasAnyRole(userRoles, [ROLES.EMPLOYEE, ROLES.MANAGEMENT, ROLES.ADMIN, ROLES.DELIVERY_DRIVER]) && order.userId !== userId) {
      throw new AppError('Access denied', 403);
    }

    return {
      ...order,
      items: order.items.map(shapeOrderItem),
      statusEvents: shapeStatusEvents(order.statusEvents),
      payments: shapePayments(order.payments),
    };
  }

  /**
   * Create a new order (checkout)
   */
  // Creates an order, enforces stock and delivery rules, persists delivery snapshots, and triggers notifications/printing.
  async createOrder(data: CreateOrderData) {
    const { userId, items, cashAppUsername, deliveryMethod, deliveryAddress, vehicleDescription, paymentMethod } = data;
    const effectivePaymentMethod = (paymentMethod || PaymentMethod.EXTERNAL) as PaymentMethodEnum;
    const paymentStrategy = getPaymentStrategy(effectivePaymentMethod);
    const fulfillmentStrategy = getFulfillmentStrategy(deliveryMethod as DeliveryMethodEnum);
    const effectiveDeliveryAddress = deliveryAddress;

    logger.info('Creating new order', {
      userId,
      itemCount: items?.length || 0,
      items: items?.map(i => ({ variantId: i.variantId, quantity: i.quantity })),
      deliveryMethod,
      paymentMethod: effectivePaymentMethod,
    });

    if (!Object.values(DeliveryMethod).includes(deliveryMethod)) {
      logger.warn('Order creation failed: invalid delivery method', {
        userId,
        deliveryMethod,
      });
      throw new AppError('Delivery method must be DELIVERY, PICKUP, or CURBSIDE', 400);
    }

    if (!items || items.length === 0) {
      logger.warn('Order creation failed: empty items array', { userId });
      throw new AppError('Order must contain at least one item', 400);
    }

    // Early compatibility check (no total needed): catches e.g. IN_STORE+DELIVERY before any DB work.
    paymentStrategy.validate({ userId, deliveryMethod, cashAppUsername, total: 0 });

    // Update user's CashApp username if provided (ensures orders page shows correct payment info)
    if (cashAppUsername?.trim()) {
      await prisma.user.update({
        where: { id: userId },
        data: { cashapp: cashAppUsername.trim() }
      });
      logger.debug('Updated user CashApp username for order', { userId });
    }

    // Fetch variant details (with product + pricing) and calculate total
    const variantIds = items.map(item => item.variantId);
    logger.debug('Fetching variants for order creation', { variantIds });

    try {
      const variants = await prisma.productVariant.findMany({
        where: { id: { in: variantIds }, active: true },
        include: { product: true, quantityOptions: true, priceBreaks: true },
      });
      const variantMap = new Map(variants.map(v => [v.id, v]));

      if (variants.length !== new Set(variantIds).size) {
        logger.warn('Order creation failed: some variants not found', {
          userId,
          requestedVariantIds: variantIds,
          foundVariantIds: variants.map(v => v.id),
        });
        throw new AppError('Some products not found', 404);
      }

    // Calculate total and prepare order items (unit price resolved via pricing.ts)
    let subtotal = 0;
    const orderItems = items.map(item => {
      const variant = variantMap.get(item.variantId);
      if (!variant) {
        throw new AppError(`Product variant ${item.variantId} not found`, 404);
      }

      if (!isQuantityAllowed(variant, item.quantity)) {
        throw new AppError(`Invalid quantity for ${variant.product.name}`, 400);
      }

      const unitPrice = resolveUnitPrice(variant, item.quantity);
      subtotal += unitPrice.toNumber() * item.quantity;

      return {
        variantId: variant.id,
        productName: variant.product.name,
        variantLabel: variant.label,
        quantity: item.quantity,
        unitPrice,
      };
    });

      await fulfillmentStrategy.validate({ userId, deliveryAddress: effectiveDeliveryAddress, vehicleDescription, subtotal });

      // Calculate tax and final total
      const tax = Number((subtotal * DEFAULT_TAX_RATE).toFixed(2));
      const total = subtotal + tax;

      // Validate payment method now that total is known (e.g. credit balance check).
      paymentStrategy.validate({ userId, deliveryMethod, cashAppUsername, total });

      // Create order with items
      logger.info('Creating order record in database', {
        userId,
        subtotal,
        tax,
        total,
        status: OrderStatus.PENDING,
        paymentMethod: effectivePaymentMethod,
      });

      const result = await prisma.$transaction(async (tx) => {
        const newOrder = await tx.order.create({
          data: {
            userId,
            subtotal,
            tax,
            taxRate: DEFAULT_TAX_RATE,
            total,
            status: paymentStrategy.initialStatus(),
            deliveryMethod,
            paymentMethod: effectivePaymentMethod,
            ...await fulfillmentStrategy.buildOrderFields({ userId, deliveryAddress: effectiveDeliveryAddress, vehicleDescription, subtotal }),
          }
        });

        const newItems = await Promise.all(
          orderItems.map(item =>
            tx.orderItem.create({
              data: {
                orderId: newOrder.id,
                variantId: item.variantId,
                productName: item.productName,
                variantLabel: item.variantLabel,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
              }
            })
          )
        );

        for (const item of items) {
          const variant = variantMap.get(item.variantId);
          if (variant && variant.stockEnabled) {
            await decrementStockGuarded(tx, variant.id, item.quantity, variant.product.name);
          }
        }

        if (fulfillmentStrategy.applyInTransaction) {
          await fulfillmentStrategy.applyInTransaction(tx, newOrder.id, userId, { userId, deliveryAddress: effectiveDeliveryAddress, vehicleDescription, subtotal });
        }

        await paymentStrategy.applyInTransaction(tx, newOrder.id, { userId, deliveryMethod, cashAppUsername, total });

        return {
          newOrder,
          newItems,
        };
      });

      const order = result.newOrder;
      const createdItems = result.newItems;

      logger.info('Order created in database', {
        orderId: order.id,
        userId,
        total,
        status: order.status,
        paymentMethod: order.paymentMethod,
      });

      logger.debug('Creating order items', {
        orderId: order.id,
        itemCount: orderItems.length,
      });

      logger.info('Order items created in database', {
        orderId: order.id,
        itemCount: createdItems.length,
        items: createdItems.map(i => ({ id: i.id, variantId: i.variantId, quantity: i.quantity })),
      });

      // Attach variant/product info for the response using the fetched variants.
      const itemsWithProducts = createdItems.map(item => {
        const variant = variantMap.get(item.variantId);
        return shapeOrderItem({ ...item, variant });
      });

      logger.info('Order creation completed successfully', {
        orderId: order.id,
        userId,
        total,
        itemCount: itemsWithProducts.length,
      });

      if (paymentStrategy.notifiesOnCreate()) {
        await dispatchOrderCreatedEffects(order.id, userId);
      }

      // Re-fetch so payments/statusEvents written by the payment strategy
      // inside the same transaction are visible in the response.
      const fullOrder = await prisma.order.findUnique({
        where: { id: order.id },
        include: {
          statusEvents: { orderBy: { createdAt: 'asc' } },
          payments: true,
        },
      });

      return {
        ...order,
        items: itemsWithProducts,
        statusEvents: shapeStatusEvents(fullOrder?.statusEvents ?? []),
        payments: shapePayments(fullOrder?.payments ?? []),
      };
    } catch (error) {
      logger.error('Failed to create order', error, {
        userId,
        items: items?.map(i => ({ variantId: i.variantId, quantity: i.quantity })),
      });
      throw error;
    }
  }

  /**
   * Update order status
   * Management/Admin can update to any status
   * Delivery Driver can only update to DELIVERED
   */
  // Updates order status, applies any required side effects, and keeps role-aware delivery transitions intact.
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
        // Drivers complete the handoff once an order is ready for or out for delivery.
        // OUT_FOR_DELIVERY is the state staff dispatch into (and the only one whose
        // card exposes the "mark delivered" control on the driver dashboard), so it
        // must be deliverable — otherwise drivers cannot finish a delivery in the UI.
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

  /**
   * Add item to existing order (Management/Admin only)
   */
  // Adds a post-submission order item, validates quantity rules, and marks the item as added after submission.
  async addItemToOrder(orderId: number, data: AddOrderItemData) {
    logger.info('Adding item to order', {
      orderId,
      variantId: data.variantId,
      quantity: data.quantity,
    });

    try {
      const order = await prisma.order.findUnique({ where: { id: orderId } });

      if (!order) {
        logger.warn('Add item failed: order not found', { orderId, variantId: data.variantId });
        throw new AppError('Order not found', 404);
      }

      const variant = await prisma.productVariant.findUnique({
        where: { id: data.variantId },
        include: { product: true, quantityOptions: true, priceBreaks: true },
      });

      if (!variant) {
        logger.warn('Add item failed: variant not found', { orderId, variantId: data.variantId });
        throw new AppError('Product not found', 404);
      }

      if (!isQuantityAllowed(variant, data.quantity)) {
        throw new AppError(`Invalid quantity for ${variant.product.name}`, 400);
      }

      const unitPrice = resolveUnitPrice(variant, data.quantity);

      // Recalculate order total (Decimal so money stays exact)
      const oldTotal = order.total;
      const newTotal = order.total.add(unitPrice.mul(data.quantity));

      const { orderItem } = await prisma.$transaction(async (tx) => {
        const orderItem = await tx.orderItem.create({
          data: {
            orderId,
            variantId: variant.id,
            productName: variant.product.name,
            variantLabel: variant.label,
            quantity: data.quantity,
            unitPrice,
            addedAfterSubmission: true,
          }
        });

        await tx.order.update({ where: { id: orderId }, data: { total: newTotal } });

        if (variant.stockEnabled) {
          await decrementStockGuarded(tx, variant.id, data.quantity, variant.product.name);
        }

        return { orderItem, newTotal };
      });

      logger.info('Order item added successfully', {
        orderId,
        orderItemId: orderItem.id,
        oldTotal,
        newTotal,
      });

      return orderItem;
    } catch (error) {
      logger.error('Failed to add item to order', error, {
        orderId,
        variantId: data.variantId,
        quantity: data.quantity,
      });
      throw error;
    }
  }

  /**
   * Void order item (Management/Admin only)
   */
  // Marks one order item voided without removing the record so fulfillment and receipt history stay auditable.
  async voidOrderItem(orderId: number, itemId: number) {
    const orderItem = await prisma.orderItem.findFirst({
      where: { id: itemId, orderId }
    });

    if (!orderItem) {
      throw new AppError('Order item not found', 404);
    }

    if (orderItem.voided) {
      throw new AppError('Item is already voided', 400);
    }

    // Mark as voided
    const updated = await prisma.orderItem.update({
      where: { id: itemId },
      data: { voided: true }
    });

    // Recalculate order total
    const order = await prisma.order.findUnique({
      where: { id: orderId }
    });

    const orderItems = await prisma.orderItem.findMany({
      where: { orderId }
    });

    if (order) {
      const newTotal = sumOrderItems(orderItems);

      await prisma.order.update({
        where: { id: orderId },
        data: { total: newTotal }
      });
    }

    return updated;
  }

  /**
   * Delete order item (Management/Admin only)
   */
  // Deletes one order item permanently after validation when the editing flow requires full removal instead of voiding.
  async deleteOrderItem(orderId: number, itemId: number) {
    logger.info('Deleting order item', { orderId, itemId });

    try {
      const orderItem = await prisma.orderItem.findFirst({
        where: { id: itemId, orderId }
      });

      if (!orderItem) {
        logger.warn('Delete order item failed: item not found', { orderId, itemId });
        throw new AppError('Order item not found', 404);
      }

      logger.debug('Order item found for deletion', {
        orderId,
        itemId,
        variantId: orderItem.variantId,
        quantity: orderItem.quantity,
        unitPrice: orderItem.unitPrice,
      });

      await prisma.orderItem.delete({ where: { id: itemId } });

      logger.info('Order item deleted from database', {
        orderId,
        itemId,
        variantId: orderItem.variantId,
      });

      // Recalculate order total
      const order = await prisma.order.findUnique({
        where: { id: orderId }
      });

      const orderItems = await prisma.orderItem.findMany({
        where: { orderId }
      });

      if (order) {
        const oldTotal = order.total;
        const newTotal = sumOrderItems(orderItems);

        logger.debug('Recalculating order total after item deletion', {
          orderId,
          oldTotal,
          newTotal,
          remainingItemsCount: orderItems.filter(item => !item.voided).length,
        });

        await prisma.order.update({
          where: { id: orderId },
          data: { total: newTotal }
        });

        logger.info('Order total updated after item deletion', {
          orderId,
          oldTotal,
          newTotal,
        });
      }

      return { message: 'Order item deleted successfully' };
    } catch (error) {
      logger.error('Failed to delete order item', error, { orderId, itemId });
      throw error;
    }
  }

  /**
   * Delete entire order (Admin only)
   */
  // Deletes an order and restores reserved stock so cancelled or test orders do not keep inventory locked.
  // requesterId: null = admin (no restrictions); number = customer (must own + must be PENDING).
  async deleteOrder(orderId: number, requesterId: number | null) {
    logger.info('Deleting order', { orderId, requesterId });

    try {
      const order = await prisma.order.findUnique({ where: { id: orderId } });

      if (!order) {
        logger.warn('Order deletion failed: order not found', { orderId });
        throw new AppError('Order not found', 404);
      }

      if (requesterId !== null) {
        if (order.userId !== requesterId) throw new AppError('Order not found', 404);
        if (order.status !== 'PENDING') throw new AppError('Only PENDING orders can be cancelled', 403);
      }

      logger.debug('Order found for deletion', {
        orderId,
        userId: order.userId,
        status: order.status,
        total: order.total,
      });

      await prisma.order.delete({ where: { id: orderId } });

      logger.info('Order deleted from database', {
        orderId,
        userId: order.userId,
        status: order.status,
        total: order.total,
      });

      const deletePaymentStrategy = getPaymentStrategy(order.paymentMethod as PaymentMethodEnum);
      await deletePaymentStrategy.refundOnDelete(orderId, order.userId, order.total.toNumber());

      return { message: 'Order deleted successfully' };
    } catch (error) {
      logger.error('Failed to delete order', error, { orderId });
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

  async getPaymentToken(orderId: number, userId: number): Promise<{ token: string; paymentFormUrl: string }> {
    const order = await prisma.order.findUnique({ where: { id: orderId } });

    if (!order) throw new AppError('Order not found', 404);
    if (order.userId !== userId) throw new AppError('Not authorized', 403);
    if (order.paymentMethod !== PaymentMethod.CC) throw new AppError('Order is not a card payment', 400);
    if (order.status !== OrderStatus.PENDING_PAYMENT) throw new AppError('Order is not awaiting payment', 400);

    const strategy = getPaymentStrategy(order.paymentMethod as PaymentMethodEnum);
    return strategy.initializePaymentSession(orderId, order.total.toNumber());
  }

  async confirmCardPayment(orderId: number, userId: number, transId: string): Promise<{ id: number; status: string }> {
    const order = await prisma.order.findUnique({ where: { id: orderId } });

    if (!order) throw new AppError('Order not found', 404);
    if (order.userId !== userId) throw new AppError('Not authorized', 403);
    if (order.paymentMethod !== PaymentMethod.CC) throw new AppError('Order is not a card payment', 400);
    if (order.status !== OrderStatus.PENDING_PAYMENT) throw new AppError('Order is not awaiting payment', 400);

    // Replay protection: the same transaction must not confirm two orders.
    // The @unique constraint on Payment.transactionId is the hard backstop; this check gives a clean error.
    const duplicate = await prisma.payment.findFirst({
      where: { transactionId: transId, NOT: { orderId } },
    });
    if (duplicate) throw new AppError('This payment has already been applied to another order', 400);

    const strategy = getPaymentStrategy(order.paymentMethod as PaymentMethodEnum);
    const result = await strategy.confirmPayment(orderId, userId, transId, order.total.toNumber());

    await dispatchOrderCreatedEffects(orderId, userId);

    return result;
  }
}

export default new OrderService();
