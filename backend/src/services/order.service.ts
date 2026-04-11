import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { OrderStatus } from '../../generated/prisma';
import { RoleName, hasAnyRole, ROLES } from '../constants/roles';
import { DEFAULT_TAX_RATE } from '../constants/settings';
import { DeliveryMethod, PaymentMethod } from '../constants/orderMethods';
import { logger } from '../utils/logger';
import creditService from './credit.service';
import { OrderingConstraintsService } from './orderingConstraints.service';
import { notificationEventsService } from './notificationEvents.service';

const orderingConstraintsService = new OrderingConstraintsService();

interface CreateOrderData {
  userId: number;
  items: Array<{
    productId: number;
    quantity: number;
  }>;
  cashAppUsername?: string;
  deliveryMethod?: string;
  paymentMethod?: string;
}

interface UpdateOrderStatusData {
  status: OrderStatus;
}

interface AddOrderItemData {
  productId: number;
  quantity: number;
}

export class OrderService {
  private normalizeQuantityDiscounts(value: unknown) {
    if (!Array.isArray(value)) return [];
    return value
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null;
        const quantity = Number((entry as any).quantity);
        const type = (entry as any).type;
        const discountValue = Number((entry as any).value);
        if (!Number.isFinite(quantity) || quantity <= 0) return null;
        if (type !== 'percent' && type !== 'fixed') return null;
        if (!Number.isFinite(discountValue) || discountValue < 0) return null;
        if (type === 'percent' && discountValue > 100) return null;
        return { quantity, type, value: discountValue };
      })
      .filter(Boolean) as Array<{ quantity: number; type: 'percent' | 'fixed'; value: number }>;
  }

  private resolveAllowedQuantities(product: { allowedQuantitiesOverride?: number[]; category?: { allowedQuantities?: number[] } }) {
    if (product.allowedQuantitiesOverride && product.allowedQuantitiesOverride.length > 0) {
      return product.allowedQuantitiesOverride;
    }
    return product.category?.allowedQuantities ?? [];
  }

  private resolveQuantityDiscounts(product: {
    quantityDiscountsOverride?: unknown;
    category?: { quantityDiscounts?: unknown };
  }) {
    const override = this.normalizeQuantityDiscounts(product.quantityDiscountsOverride);
    if (override.length > 0) return override;
    return this.normalizeQuantityDiscounts(product.category?.quantityDiscounts);
  }

  private resolveDiscountedUnitPrice(
    basePrice: number,
    quantity: number,
    rules: Array<{ quantity: number; type: 'percent' | 'fixed'; value: number }>
  ) {
    const match = rules.find((rule) => Math.abs(rule.quantity - quantity) < 1e-9);
    if (!match) return basePrice;
    const discount =
      match.type === 'percent'
        ? basePrice * (match.value / 100)
        : match.value;
    return Math.max(0, basePrice - discount);
  }

  private isQuantityAllowed(quantity: number, allowedQuantities: number[]) {
    return allowedQuantities.some((allowed) => Math.abs(allowed - quantity) < 1e-9);
  }

  /**
   * Get all orders (with user filtering for customers)
   */
  async getAllOrders(userId: number, userRoles: RoleName[]) {
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
        orderBy: {
          createdAt: 'desc'
        }
      });

      logger.info('Orders retrieved from database', {
        userId,
        orderCount: orders.length,
        orderIds: orders.map(o => o.id),
      });

      // Fetch users for orders
      const userIds = [...new Set(orders.map(o => o.userId))];
      logger.debug('Fetching users for orders', { userIds });

      const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, username: true, cashapp: true, phoneNumber: true, address: true }
      });
      const userMap = new Map(users.map(u => [u.id, u]));

      // Fetch order items
      const orderIds = orders.map(o => o.id);
      logger.debug('Fetching order items', { orderIds });

      const orderItems = await prisma.orderItem.findMany({
        where: { orderId: { in: orderIds } }
      });

      // Fetch products for order items
      const productIds = [...new Set(orderItems.map(item => item.productId))];
      logger.debug('Fetching products for order items', { productIds });

      const products = await prisma.productItem.findMany({
        where: { id: { in: productIds } },
        include: { category: true }
      });
      const productMap = new Map(products.map(p => [p.id, p]));

      // Group items by order and attach products
      const itemsByOrder = new Map<number, any[]>();
      for (const item of orderItems) {
        if (!itemsByOrder.has(item.orderId)) {
          itemsByOrder.set(item.orderId, []);
        }
        itemsByOrder.get(item.orderId)!.push({
          ...item,
          product: productMap.get(item.productId) || null
        });
      }

      // Join orders with users and items
      const result = orders.map(order => ({
        ...order,
        user: userMap.get(order.userId) || null,
        items: itemsByOrder.get(order.id) || []
      }));

      logger.info('Orders retrieval completed', {
        userId,
        totalOrders: result.length,
        totalItems: orderItems.length,
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
      where: {
        status: 'DELIVERED'
      },
      orderBy: {
        updatedAt: 'desc' // Latest first
      }
    });

    // Fetch users for orders
    const userIds = [...new Set(orders.map(o => o.userId))];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true, address: true, phoneNumber: true }
    });
    const userMap = new Map(users.map(u => [u.id, u]));

    // Fetch order items
    const orderIds = orders.map(o => o.id);
    const orderItems = await prisma.orderItem.findMany({
      where: { orderId: { in: orderIds } }
    });

    // Fetch products for order items
    const productIds = [...new Set(orderItems.map(oi => oi.productId))];
    const products = await prisma.productItem.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, price: true, image: true }
    });
    const productMap = new Map(products.map(p => [p.id, p]));

    // Group items by order
    const itemsByOrder = new Map<number, typeof orderItems>();
    for (const item of orderItems) {
      if (!itemsByOrder.has(item.orderId)) {
        itemsByOrder.set(item.orderId, []);
      }
      itemsByOrder.get(item.orderId)!.push(item);
    }

    return orders.map(order => {
      const user = userMap.get(order.userId);
      const items = itemsByOrder.get(order.id) || [];
      
      return {
        id: order.id,
        status: order.status,
        total: order.total,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        user: user ? {
          id: user.id,
          username: user.username,
          address: user.address,
          phoneNumber: user.phoneNumber
        } : null,
        items: items.map(item => {
          const product = productMap.get(item.productId);
          return {
            id: item.id,
            productId: item.productId,
            productName: product?.name || 'Unknown Product',
            productImage: product?.image || null,
            quantity: item.quantity,
            price: item.price,
            voided: item.voided,
            addedAfterSubmission: item.addedAfterSubmission
          };
        })
      };
    });
  }

  /**
   * Get out-for-delivery orders (for delivery drivers)
   */
  async getOutForDeliveryOrders() {
    const orders = await prisma.order.findMany({
      where: {
        status: 'OUT_FOR_DELIVERY'
      },
      orderBy: {
        createdAt: 'asc' // Oldest first
      }
    });

    // Fetch users for orders
    const userIds = [...new Set(orders.map(o => o.userId))];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true, address: true, phoneNumber: true }
    });
    const userMap = new Map(users.map(u => [u.id, u]));

    // Fetch order items
    const orderIds = orders.map(o => o.id);
    const orderItems = await prisma.orderItem.findMany({
      where: { orderId: { in: orderIds } }
    });

    // Fetch products for order items
    const productIds = [...new Set(orderItems.map(oi => oi.productId))];
    const products = await prisma.productItem.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, price: true, image: true }
    });
    const productMap = new Map(products.map(p => [p.id, p]));

    // Group order items by order
    const itemsByOrder = new Map<number, typeof orderItems>();
    for (const item of orderItems) {
      if (!itemsByOrder.has(item.orderId)) {
        itemsByOrder.set(item.orderId, []);
      }
      itemsByOrder.get(item.orderId)!.push(item);
    }

    // Format orders with user and items
    return orders.map(order => {
      const user = userMap.get(order.userId);
      const items = itemsByOrder.get(order.id) || [];

      return {
        id: order.id,
        status: order.status,
        total: order.total,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        user: user ? {
          id: user.id,
          username: user.username,
          address: user.address,
          phoneNumber: user.phoneNumber
        } : null,
        items: items.map(item => {
          const product = productMap.get(item.productId);
          return {
            id: item.id,
            productId: item.productId,
            productName: product?.name || 'Unknown Product',
            productImage: product?.image || null,
            quantity: item.quantity,
            price: item.price,
            voided: item.voided,
            addedAfterSubmission: item.addedAfterSubmission
          };
        })
      };
    });
  }

  /**
   * Get ready-for-delivery orders (for delivery drivers)
   */
  async getReadyForDeliveryOrders() {
    const orders = await prisma.order.findMany({
      where: {
        status: 'READY_FOR_DELIVERY'
      },
      orderBy: {
        createdAt: 'asc' // Oldest first
      }
    });

    // Fetch users for orders
    const userIds = [...new Set(orders.map(o => o.userId))];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true, address: true, phoneNumber: true }
    });
    const userMap = new Map(users.map(u => [u.id, u]));

    // Fetch order items
    const orderIds = orders.map(o => o.id);
    const orderItems = await prisma.orderItem.findMany({
      where: { orderId: { in: orderIds } }
    });

    // Fetch products for order items
    const productIds = [...new Set(orderItems.map(oi => oi.productId))];
    const products = await prisma.productItem.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, price: true, image: true }
    });
    const productMap = new Map(products.map(p => [p.id, p]));

    // Group order items by order
    const itemsByOrder = new Map<number, typeof orderItems>();
    for (const item of orderItems) {
      if (!itemsByOrder.has(item.orderId)) {
        itemsByOrder.set(item.orderId, []);
      }
      itemsByOrder.get(item.orderId)!.push(item);
    }

    // Format orders with user and items
    return orders.map(order => {
      const user = userMap.get(order.userId);
      const items = itemsByOrder.get(order.id) || [];

      return {
        id: order.id,
        status: order.status,
        total: order.total,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        user: user ? {
          id: user.id,
          username: user.username,
          address: user.address,
          phoneNumber: user.phoneNumber
        } : null,
        items: items.map(item => {
          const product = productMap.get(item.productId);
          return {
            id: item.id,
            productId: item.productId,
            productName: product?.name || 'Unknown Product',
            productImage: product?.image || null,
            quantity: item.quantity,
            price: item.price,
            voided: item.voided,
            addedAfterSubmission: item.addedAfterSubmission
          };
        })
      };
    });
  }

  /**
   * Get single order by ID
   */
  async getOrderById(orderId: number, userId: number, userRoles: RoleName[]) {
    const order = await prisma.order.findUnique({
      where: { id: orderId }
    });

    if (!order) {
      throw new AppError('Order not found', 404);
    }

    // Customers can only view their own orders
    if (!hasAnyRole(userRoles, [ROLES.EMPLOYEE, ROLES.MANAGEMENT, ROLES.ADMIN, ROLES.DELIVERY_DRIVER]) && order.userId !== userId) {
      throw new AppError('Access denied', 403);
    }

    // Fetch user
    const user = await prisma.user.findUnique({
      where: { id: order.userId },
      select: { id: true, username: true, cashapp: true, phoneNumber: true, address: true }
    });

    // Fetch order items
    const orderItems = await prisma.orderItem.findMany({
      where: { orderId }
    });

    // Fetch products for order items
    const productIds = [...new Set(orderItems.map(item => item.productId))];
    const products = await prisma.productItem.findMany({
      where: { id: { in: productIds } }
    });
    const productMap = new Map(products.map(p => [p.id, p]));

    // Attach products to items
    const itemsWithProducts = orderItems.map(item => ({
      ...item,
      product: productMap.get(item.productId) || null
    }));

    return {
      ...order,
      user: user || null,
      items: itemsWithProducts
    };
  }

  /**
   * Create a new order (checkout)
   */
  async createOrder(data: CreateOrderData) {
    const { userId, items, cashAppUsername, deliveryMethod, paymentMethod } = data;
    const isCredit = paymentMethod === PaymentMethod.CREDIT;

    // IN_STORE payment is only valid for pickup orders
    if (paymentMethod === PaymentMethod.IN_STORE && deliveryMethod !== DeliveryMethod.PICKUP) {
      throw new AppError('Pay in store is only available for pickup orders', 400);
    }

    // Update user's CashApp username if provided (ensures orders page shows correct payment info)
    if (cashAppUsername?.trim()) {
      await prisma.user.update({
        where: { id: userId },
        data: { cashapp: cashAppUsername.trim() }
      });
      logger.debug('Updated user CashApp username for order', { userId });
    }

    logger.info('Creating new order', {
      userId,
      itemCount: items?.length || 0,
      items: items?.map(i => ({ productId: i.productId, quantity: i.quantity })),
    });

    if (!items || items.length === 0) {
      logger.warn('Order creation failed: empty items array', { userId });
      throw new AppError('Order must contain at least one item', 400);
    }

    // Fetch product details and calculate total
    const productIds = items.map(item => item.productId);
    logger.debug('Fetching products for order creation', { productIds });

    try {
      const products = await prisma.productItem.findMany({
        where: { id: { in: productIds } },
        include: { category: true }
      });

      logger.debug('Products fetched for order', {
        requestedCount: productIds.length,
        foundCount: products.length,
        productIds: products.map(p => p.id),
      });

      if (products.length !== items.length) {
        logger.warn('Order creation failed: some products not found', {
          userId,
          requestedProductIds: productIds,
          foundProductIds: products.map(p => p.id),
        });
        throw new AppError('Some products not found', 404);
      }

    // Calculate total and prepare order items
    let subtotal = 0;
    const orderItems = items.map(item => {
      const product = products.find(p => p.id === item.productId);
      if (!product) {
        throw new AppError(`Product ${item.productId} not found`, 404);
      }

      const allowedQuantities = this.resolveAllowedQuantities(product);
      if (allowedQuantities.length > 0 && !this.isQuantityAllowed(item.quantity, allowedQuantities)) {
        throw new AppError(`Invalid quantity for ${product.name}`, 400);
      }

      // Check stock if enabled
      if (product.stockEnabled && product.stock < item.quantity) {
        throw new AppError(`Insufficient stock for ${product.name}`, 400);
      }

      const discountRules = this.resolveQuantityDiscounts(product);
      const unitPrice = this.resolveDiscountedUnitPrice(product.price, item.quantity, discountRules);
      const itemTotal = unitPrice * item.quantity;
      subtotal += itemTotal;

      return {
        productId: product.id,
        quantity: item.quantity,
        price: unitPrice
      };
    });

      // Enforce minimum delivery order
      const { minimumDeliveryOrder, minimumDeliveryOrderEnabled } = await orderingConstraintsService.getOrderingConstraints();
      if (deliveryMethod === DeliveryMethod.DELIVERY && minimumDeliveryOrderEnabled && subtotal < minimumDeliveryOrder) {
        throw new AppError(`Minimum order of $${minimumDeliveryOrder.toFixed(2)} required for delivery`, 400);
      }

      // Calculate tax and final total
      const tax = Number((subtotal * DEFAULT_TAX_RATE).toFixed(2));
      const total = subtotal + tax;

      // Create order with items
      logger.info('Creating order record in database', {
        userId,
        subtotal,
        tax,
        total,
        status: OrderStatus.PENDING,
        paymentMethod: paymentMethod || PaymentMethod.EXTERNAL,
      });

      let order: Awaited<ReturnType<typeof prisma.order.create>>;
      let createdItems: Awaited<ReturnType<typeof prisma.orderItem.create>>[];

      if (isCredit) {
        // Use a transaction to atomically create the order and deduct credit
        const result = await prisma.$transaction(async (tx) => {
          const newOrder = await tx.order.create({
            data: {
              userId,
              total,
              status: OrderStatus.PENDING,
              deliveryMethod: deliveryMethod || DeliveryMethod.DELIVERY,
              paymentMethod: PaymentMethod.CREDIT,
            }
          });

          const newItems = await Promise.all(
            orderItems.map(item =>
              tx.orderItem.create({
                data: {
                  orderId: newOrder.id,
                  productId: item.productId,
                  quantity: item.quantity,
                  price: item.price
                }
              })
            )
          );

          // Deduct credit inside the same transaction
          await creditService.useCredit(userId, total, newOrder.id, tx);

          return { newOrder, newItems };
        });

        order = result.newOrder;
        createdItems = result.newItems;
      } else {
        order = await prisma.order.create({
          data: {
            userId,
            total,
            status: OrderStatus.PENDING,
            deliveryMethod: deliveryMethod || DeliveryMethod.DELIVERY,
            paymentMethod: paymentMethod || PaymentMethod.EXTERNAL,
          }
        });

        createdItems = await Promise.all(
          orderItems.map(item =>
            prisma.orderItem.create({
              data: {
                orderId: order.id,
                productId: item.productId,
                quantity: item.quantity,
                price: item.price
              }
            })
          )
        );
      }

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
        items: createdItems.map(i => ({ id: i.id, productId: i.productId, quantity: i.quantity })),
      });

      // Update stock if enabled
      const stockUpdates: Array<{ productId: number; oldStock: number; newStock: number; quantity: number }> = [];
      for (const item of items) {
        const product = products.find(p => p.id === item.productId);
        if (product && product.stockEnabled) {
          const oldStock = product.stock;
          await prisma.productItem.update({
            where: { id: product.id },
            data: { stock: { decrement: item.quantity } }
          });
          stockUpdates.push({
            productId: product.id,
            oldStock,
            newStock: oldStock - item.quantity,
            quantity: item.quantity,
          });
        }
      }

      if (stockUpdates.length > 0) {
        logger.info('Product stock updated for order', {
          orderId: order.id,
          stockUpdates,
        });
      }

      // Fetch products for return
      const productMap = new Map(products.map(p => [p.id, p]));
      const itemsWithProducts = createdItems.map(item => ({
        ...item,
        product: productMap.get(item.productId) || null
      }));

      logger.info('Order creation completed successfully', {
        orderId: order.id,
        userId,
        total,
        itemCount: itemsWithProducts.length,
        stockUpdatesCount: stockUpdates.length,
      });

      await notificationEventsService.notifyOrderCreated(order.id, userId);

      return {
        ...order,
        items: itemsWithProducts
      };
    } catch (error) {
      logger.error('Failed to create order', error, {
        userId,
        items: items?.map(i => ({ productId: i.productId, quantity: i.quantity })),
      });
      throw error;
    }
  }

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
        if (order.status !== OrderStatus.READY_FOR_DELIVERY) {
          logger.warn('Order status update denied: delivery driver can only update READY_FOR_DELIVERY orders', {
            orderId,
            currentStatus: order.status,
            attemptedStatus: data.status,
          });
          throw new AppError('Can only mark READY_FOR_DELIVERY orders as DELIVERED', 400);
        }
      }

      logger.info('Updating order status in database', {
        orderId,
        oldStatus: order.status,
        newStatus: data.status,
      });

      const updatedOrder = await prisma.order.update({
        where: { id: orderId },
        data: { status: data.status }
      });

      logger.info('Order status updated in database', {
        orderId,
        oldStatus: order.status,
        newStatus: updatedOrder.status,
        updatedAt: updatedOrder.updatedAt,
      });

      // Fetch order items with products
      const orderItems = await prisma.orderItem.findMany({
        where: { orderId }
      });

      const productIds = [...new Set(orderItems.map(item => item.productId))];
      const products = await prisma.productItem.findMany({
        where: { id: { in: productIds } }
      });
      const productMap = new Map(products.map(p => [p.id, p]));

      const itemsWithProducts = orderItems.map(item => ({
        ...item,
        product: productMap.get(item.productId) || null
      }));

      logger.info('Order status update completed successfully', {
        orderId,
        oldStatus: order.status,
        newStatus: updatedOrder.status,
        itemCount: itemsWithProducts.length,
      });

      await notificationEventsService.notifyOrderStatusUpdated(
        orderId,
        order.userId,
        updatedOrder.status,
        order.status,
      );

      return {
        ...updatedOrder,
        items: itemsWithProducts
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
  async addItemToOrder(orderId: number, data: AddOrderItemData) {
    logger.info('Adding item to order', {
      orderId,
      productId: data.productId,
      quantity: data.quantity,
    });

    try {
      const order = await prisma.order.findUnique({ 
        where: { id: orderId }
      });

      if (!order) {
        logger.warn('Add item failed: order not found', { orderId, productId: data.productId });
        throw new AppError('Order not found', 404);
      }

      const product = await prisma.productItem.findUnique({ 
        where: { id: data.productId },
        include: { category: true }
      });

      if (!product) {
        logger.warn('Add item failed: product not found', { orderId, productId: data.productId });
        throw new AppError('Product not found', 404);
      }

      const allowedQuantities = this.resolveAllowedQuantities(product);
      if (allowedQuantities.length > 0 && !this.isQuantityAllowed(data.quantity, allowedQuantities)) {
        throw new AppError(`Invalid quantity for ${product.name}`, 400);
      }

      // Create new order item
      const discountRules = this.resolveQuantityDiscounts(product);
      const unitPrice = this.resolveDiscountedUnitPrice(product.price, data.quantity, discountRules);

      logger.debug('Creating order item', {
        orderId,
        productId: data.productId,
        quantity: data.quantity,
        price: unitPrice,
      });

      const orderItem = await prisma.orderItem.create({
        data: {
          orderId,
          productId: data.productId,
          quantity: data.quantity,
          price: unitPrice,
          addedAfterSubmission: true
        }
      });

      logger.info('Order item created in database', {
        orderItemId: orderItem.id,
        orderId,
        productId: data.productId,
        quantity: data.quantity,
      });

      // Recalculate order total
      const oldTotal = order.total;
      const newTotal = order.total + (unitPrice * data.quantity);
      
      logger.debug('Updating order total', {
        orderId,
        oldTotal,
        newTotal,
        itemCost: unitPrice * data.quantity,
      });

      await prisma.order.update({
        where: { id: orderId },
        data: { total: newTotal }
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
        productId: data.productId,
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
      const newTotal = orderItems
        .filter(item => !item.voided)
        .reduce((sum, item) => sum + (item.price * item.quantity), 0);

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
        productId: orderItem.productId,
        quantity: orderItem.quantity,
        price: orderItem.price,
      });

      await prisma.orderItem.delete({ where: { id: itemId } });

      logger.info('Order item deleted from database', {
        orderId,
        itemId,
        productId: orderItem.productId,
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
        const newTotal = orderItems
          .filter(item => !item.voided)
          .reduce((sum, item) => sum + (item.price * item.quantity), 0);

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
  async deleteOrder(orderId: number) {
    logger.info('Deleting order', { orderId });

    try {
      const order = await prisma.order.findUnique({ where: { id: orderId } });

      if (!order) {
        logger.warn('Order deletion failed: order not found', { orderId });
        throw new AppError('Order not found', 404);
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

      // Auto-refund credit if this was a credit-paid order
      if (order.paymentMethod === PaymentMethod.CREDIT) {
        logger.info('Auto-refunding credit for deleted credit order', { orderId, userId: order.userId, total: order.total });
        await creditService.refundCredit(order.userId, order.total, orderId, 'Order cancelled');
      }

      return { message: 'Order deleted successfully' };
    } catch (error) {
      logger.error('Failed to delete order', error, { orderId });
      throw error;
    }
  }
}

export default new OrderService();
