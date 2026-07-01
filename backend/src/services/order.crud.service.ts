import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { OrderStatus, Prisma } from '../../generated/prisma';
import { resolveUnitPrice, isQuantityAllowed } from './pricing';
import { getTenantContextOrThrow } from '../config/tenantContext';
import { resolveVariantEffective, VariantOverrideLike } from './storeVariant.effective';
import { RoleName, hasAnyRole, ROLES } from '../constants/roles';
import { DEFAULT_TAX_RATE } from '../constants/settings';
import { DeliveryMethod, PaymentMethod } from '../constants/orderMethods';
import { logger } from '../utils/logger';
import { StructuredDeliveryAddress } from '../utils/address.util';
import { getPaymentStrategy } from './payments/registry';
import { getFulfillmentStrategy } from './fulfillment/registry';
import { PaymentMethodEnum, DeliveryMethodEnum } from '../../generated/prisma';
import { shapeOrderItem, shapeStatusEvents, shapePayments } from './orderResponseShaper';
import eventBus from './event-bus.service';

export async function decrementStockGuarded(
  tx: Prisma.TransactionClient,
  variantId: number,
  quantity: number,
  productName: string,
  opts: { storeId: number; isDefaultStore: boolean },
): Promise<void> {
  if (opts.isDefaultStore || !opts.storeId || opts.storeId === 0) {
    // Base/default path: decrement the canonical variant stock.
    // Applies for the default store, and also for the "no real store" context
    // (storeId=null or storeId=0) so behaviour is consistent with product reads.
    const result = await tx.productVariant.updateMany({
      where: { id: variantId, stock: { gte: quantity } },
      data: { stock: { decrement: quantity } },
    });
    if (result.count === 0) {
      throw new AppError(`Insufficient stock for ${productName}`, 400);
    }
  } else {
    // Real non-default store: atomically decrement the per-store override stock.
    // If no override row exists (or stock < quantity) → count === 0 → Insufficient stock.
    const result = await (tx as any).storeVariantOverride.updateMany({
      where: { storeId: opts.storeId, variantId, stock: { gte: quantity } },
      data: { stock: { decrement: quantity } },
    });
    if (result.count === 0) {
      throw new AppError(`Insufficient stock for ${productName}`, 400);
    }
  }
}

// Shared per-store override fetch used by pricing/availability resolution call sites
// (createOrder, addItemToOrder). Callers must only invoke this in a real non-default-store
// context (isBaseContext === false) — the base context uses the variant's base price/stock
// directly and never consults StoreVariantOverride rows.
// `client` is accepted as a parameter (rather than hardcoded) so callers running inside a
// transaction can pass `tx` and callers outside one can pass the request-scoped `prisma`.
export async function resolveOverridesForVariants(
  client: any,
  storeId: number,
  variantIds: number[],
): Promise<Map<number, VariantOverrideLike>> {
  const overrides: Array<{ variantId: number } & VariantOverrideLike> = await client.storeVariantOverride.findMany({
    where: { storeId, variantId: { in: variantIds } },
  });
  const overrideMap = new Map<number, VariantOverrideLike>();
  for (const ov of overrides) {
    overrideMap.set(ov.variantId, ov);
  }
  return overrideMap;
}

// Single source for the notify+print side-effects fired when an order becomes active.
// Used by createOrder (non-CC) and confirmCardPayment (CC, deferred until payment confirmed).
export async function dispatchOrderCreatedEffects(orderId: number, userId: number): Promise<void> {
  eventBus.publish('order.placed', { orderId, userId });
}

export const sumOrderItems = (items: { unitPrice: Prisma.Decimal; quantity: number; voided?: boolean }[]) =>
  items
    .filter((item) => !item.voided)
    .reduce((sum, item) => sum.add(item.unitPrice.mul(item.quantity)), new Prisma.Decimal(0));

export const orderItemsInclude = {
  items: {
    orderBy: { id: 'asc' as const },
    include: { variant: { include: { product: { include: { images: true } } } } },
  },
};

export const orderItemsListInclude = {
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

export interface CreateOrderData {
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

export interface AddOrderItemData {
  variantId: number;
  quantity: number;
}

export class OrderCrudService {
  /**
   * Get all orders (with user filtering for customers)
   * @param limit  Optional max number of orders to return
   * @param offset Optional number of orders to skip (for pagination)
   */
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
  async getOutForDeliveryOrders() {
    return this.getOrdersByStatusForDrivers('OUT_FOR_DELIVERY');
  }

  /**
   * Get ready-for-delivery orders (for delivery drivers)
   */
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

    // Read tenant/store context for per-store stock + pricing logic.
    const ctx = getTenantContextOrThrow();
    const storeId = ctx.storeId;
    const isDefaultStore = !!ctx.isDefaultStore;
    const storeOpts = { storeId: storeId!, isDefaultStore };
    // True when there is no real non-default store: the default store, or a missing/zero
    // storeId (e.g. the tenant's default store was suspended/deleted). In all base-context
    // cases, use the variant's base price/stock rather than per-store override rows.
    const isBaseContext = isDefaultStore || !storeId || storeId === 0;

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

      // For a real non-default store, fetch per-store price/stock overrides to apply
      // effective pricing. (For the base context the variant base values apply.)
      const overrideMap: Map<number, VariantOverrideLike> = isBaseContext
        ? new Map()
        : await resolveOverridesForVariants(prisma, storeId!, variantIds);

      // Calculate total and prepare order items (unit price resolved via pricing.ts
      // on top of the effective per-store base price from resolveVariantEffective).
      let subtotal = 0;
      const orderItems = items.map(item => {
        const variant = variantMap.get(item.variantId);
        if (!variant) {
          throw new AppError(`Product variant ${item.variantId} not found`, 404);
        }

        if (!isQuantityAllowed(variant, item.quantity)) {
          throw new AppError(`Invalid quantity for ${variant.product.name}`, 400);
        }

        const override = isBaseContext ? undefined : overrideMap.get(item.variantId);
        const effective = resolveVariantEffective(variant, override, isBaseContext);
        // Reject if a per-store override marks this variant inactive at the active store.
        // (In the base context the findMany filter already enforces active:true, so
        // effective.active can only be false when a real non-default store has an override
        // with activeOverride=false — that is exactly when !isBaseContext is true.)
        if (!isBaseContext && !effective.active) {
          throw new AppError(`${variant.product.name} is not available at this store`, 400);
        }
        const effectiveBasePrice = effective.price;
        // A per-store price override is FLAT: it replaces the price for ALL quantities, so the
        // tenant's quantity price breaks (absolute unitPrices) must NOT apply on top of it.
        // With no override, keep existing behaviour: tenant breaks apply on the base price.
        const priceBreaks = effective.priceOverridden ? [] : variant.priceBreaks;
        const unitPrice = resolveUnitPrice({ ...variant, basePrice: effectiveBasePrice, priceBreaks }, item.quantity);
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
            await decrementStockGuarded(tx, variant.id, item.quantity, variant.product.name, storeOpts);
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
   * Add item to existing order (Management/Admin only)
   */
  async addItemToOrder(orderId: number, data: AddOrderItemData) {
    logger.info('Adding item to order', {
      orderId,
      variantId: data.variantId,
      quantity: data.quantity,
    });

    // Read tenant/store context for per-store stock + pricing logic.
    const ctx = getTenantContextOrThrow();
    const storeId = ctx.storeId;
    const isDefaultStore = !!ctx.isDefaultStore;
    const storeOpts = { storeId: storeId!, isDefaultStore };
    const isBaseContext = isDefaultStore || !storeId || storeId === 0;

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

      // Resolve effective per-store price and availability for this variant.
      const override: VariantOverrideLike | undefined = isBaseContext
        ? undefined
        : (await resolveOverridesForVariants(prisma, storeId!, [data.variantId])).get(data.variantId);
      const effective = resolveVariantEffective(variant, override, isBaseContext);
      // Reject if a per-store override marks this variant inactive at the active store.
      if (!isBaseContext && !effective.active) {
        throw new AppError(`${variant.product.name} is not available at this store`, 400);
      }
      const effectiveBasePrice = effective.price;
      // A per-store price override is FLAT: tenant quantity price breaks do not apply on top
      // of it. With no override, keep existing behaviour (tenant breaks apply on base price).
      const priceBreaks = effective.priceOverridden ? [] : variant.priceBreaks;
      const unitPrice = resolveUnitPrice({ ...variant, basePrice: effectiveBasePrice, priceBreaks }, data.quantity);

      // Recalculate order total
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
          await decrementStockGuarded(tx, variant.id, data.quantity, variant.product.name, storeOpts);
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
}
