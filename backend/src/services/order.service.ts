import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { OrderStatus } from '../../generated/prisma';
import { RoleName, hasAnyRole } from '../constants/roles';

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
    const isCustomerScoped = !hasAnyRole(userRoles, ['MANAGEMENT', 'ADMIN']);
    const where = isCustomerScoped ? { userId } : {};

    const orders = await prisma.order.findMany({
      where,
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Fetch users for orders
    const userIds = [...new Set(orders.map(o => o.userId))];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true }
    });
    const userMap = new Map(users.map(u => [u.id, u]));

    // Fetch order items
    const orderIds = orders.map(o => o.id);
    const orderItems = await prisma.orderItem.findMany({
      where: { orderId: { in: orderIds } }
    });

    // Fetch products for order items
    const productIds = [...new Set(orderItems.map(item => item.productId))];
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
    return orders.map(order => ({
      ...order,
      user: userMap.get(order.userId) || null,
      items: itemsByOrder.get(order.id) || []
    }));
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
    if (!hasAnyRole(userRoles, ['MANAGEMENT', 'ADMIN']) && order.userId !== userId) {
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

    if (!items || items.length === 0) {
      throw new AppError('Order must contain at least one item', 400);
    }

    // Fetch product details and calculate total
    const productIds = items.map(item => item.productId);
    const products = await prisma.productItem.findMany({
      where: { id: { in: productIds } }
    });

    if (products.length !== items.length) {
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
    const order = await prisma.order.create({
      data: {
        userId,
        total,
        status: OrderStatus.PENDING
      }
    });

    // Create order items
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

    // Update stock if enabled
    for (const item of items) {
      const product = products.find(p => p.id === item.productId);
      if (product && product.stockEnabled) {
        await prisma.productItem.update({
          where: { id: product.id },
          data: { stock: { decrement: item.quantity } }
        });
      }
    }

    // Fetch products for return
    const productMap = new Map(products.map(p => [p.id, p]));
    const itemsWithProducts = createdItems.map(item => ({
      ...item,
      product: productMap.get(item.productId) || null
    }));

    return {
      ...order,
      items: itemsWithProducts
    };
  }

  /**
   * Update order status (Management/Admin only)
   */
  async updateOrderStatus(orderId: number, data: UpdateOrderStatusData) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });

    if (!order) {
      throw new AppError('Order not found', 404);
    }

    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: { status: data.status }
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

    return {
      ...updatedOrder,
      items: itemsWithProducts
    };
  }

  /**
   * Add item to existing order (Management/Admin only)
   */
  async addItemToOrder(orderId: number, data: AddOrderItemData) {
    const order = await prisma.order.findUnique({ 
      where: { id: orderId }
    });

    if (!order) {
      throw new AppError('Order not found', 404);
    }

    const product = await prisma.productItem.findUnique({ 
      where: { id: data.productId } 
    });

    if (!product) {
      throw new AppError('Product not found', 404);
    }

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

    // Recalculate order total
    const newTotal = order.total + (product.price * data.quantity);
    await prisma.order.update({
      where: { id: orderId },
      data: { total: newTotal }
    });

    return orderItem;
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
    const orderItem = await prisma.orderItem.findFirst({
      where: { id: itemId, orderId }
    });

    if (!orderItem) {
      throw new AppError('Order item not found', 404);
    }

    await prisma.orderItem.delete({ where: { id: itemId } });

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

    return { message: 'Order item deleted successfully' };
  }

  /**
   * Delete entire order (Admin only)
   */
  async deleteOrder(orderId: number) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });

    if (!order) {
      throw new AppError('Order not found', 404);
    }

    await prisma.order.delete({ where: { id: orderId } });
    return { message: 'Order deleted successfully' };
  }
}

export default new OrderService();
