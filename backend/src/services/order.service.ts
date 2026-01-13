import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { OrderStatus } from '../../generated/prisma';
import { RoleName, hasAnyRole } from '../constants/roles';
import { logger } from '../utils/logger';

interface CreateOrderData {
  userId: number;
  items: Array<{
    productId: number;
    quantity: number;
  }>;
}

interface UpdateOrderStatusData {
  status: OrderStatus;
}

interface AddOrderItemData {
  productId: number;
  quantity: number;
}

export class OrderService {
  /**
   * Get all orders (with user filtering for customers)
   */
  async getAllOrders(userId: number, userRoles: RoleName[]) {
    const isCustomerScoped = !hasAnyRole(userRoles, ['MANAGEMENT', 'ADMIN', 'DELIVERY_DRIVER']);
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
        select: { id: true, name: true, email: true }
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
        where: { id: { in: productIds } }
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
      select: { id: true, name: true, email: true, address: true, phoneNumber: true }
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
          name: user.name,
          email: user.email,
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
      select: { id: true, name: true, email: true, address: true, phoneNumber: true }
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
          name: user.name,
          email: user.email,
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
      select: { id: true, name: true, email: true, address: true, phoneNumber: true }
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
          name: user.name,
          email: user.email,
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
    if (!hasAnyRole(userRoles, ['MANAGEMENT', 'ADMIN', 'DELIVERY_DRIVER']) && order.userId !== userId) {
      throw new AppError('Access denied', 403);
    }

    // Fetch user
    const user = await prisma.user.findUnique({
      where: { id: order.userId },
      select: { id: true, name: true, email: true }
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
    const { userId, items } = data;

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
        where: { id: { in: productIds } }
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
    let total = 0;
    const orderItems = items.map(item => {
      const product = products.find(p => p.id === item.productId);
      if (!product) {
        throw new AppError(`Product ${item.productId} not found`, 404);
      }

      // Check stock if enabled
      if (product.stockEnabled && product.stock < item.quantity) {
        throw new AppError(`Insufficient stock for ${product.name}`, 400);
      }

      const itemTotal = product.price * item.quantity;
      total += itemTotal;

      return {
        productId: product.id,
        quantity: item.quantity,
        price: product.price
      };
    });

      // Create order with items
      logger.info('Creating order record in database', {
        userId,
        total,
        status: OrderStatus.PENDING,
      });

      const order = await prisma.order.create({
        data: {
          userId,
          total,
          status: OrderStatus.PENDING
        }
      });

      logger.info('Order created in database', {
        orderId: order.id,
        userId,
        total,
        status: order.status,
      });

      // Create order items
      logger.debug('Creating order items', {
        orderId: order.id,
        itemCount: orderItems.length,
      });

      const createdItems = await Promise.all(
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
      if (userRoles && hasAnyRole(userRoles, ['DELIVERY_DRIVER']) && !hasAnyRole(userRoles, ['MANAGEMENT', 'ADMIN'])) {
        if (data.status !== 'DELIVERED') {
          logger.warn('Order status update denied: delivery driver trying to set non-DELIVERED status', {
            orderId,
            attemptedStatus: data.status,
            userRoles,
          });
          throw new AppError('Delivery drivers can only mark orders as DELIVERED', 403);
        }
        // Delivery drivers can only mark READY_FOR_DELIVERY orders as DELIVERED
        if (order.status !== 'READY_FOR_DELIVERY') {
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
        where: { id: data.productId } 
      });

      if (!product) {
        logger.warn('Add item failed: product not found', { orderId, productId: data.productId });
        throw new AppError('Product not found', 404);
      }

      logger.debug('Creating order item', {
        orderId,
        productId: data.productId,
        quantity: data.quantity,
        price: product.price,
      });

      // Create new order item
      const orderItem = await prisma.orderItem.create({
        data: {
          orderId,
          productId: data.productId,
          quantity: data.quantity,
          price: product.price,
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
      const newTotal = order.total + (product.price * data.quantity);
      
      logger.debug('Updating order total', {
        orderId,
        oldTotal,
        newTotal,
        itemCost: product.price * data.quantity,
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

      return { message: 'Order deleted successfully' };
    } catch (error) {
      logger.error('Failed to delete order', error, { orderId });
      throw error;
    }
  }
}

export default new OrderService();
