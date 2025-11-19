import prisma from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { Role, OrderStatus } from '../generated/prisma';

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
  async getAllOrders(userId: number, userRole: Role) {
    const where = userRole === Role.CUSTOMER 
      ? { userId } 
      : {};

    return await prisma.order.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        items: {
          include: {
            product: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
  }

  /**
   * Get single order by ID
   */
  async getOrderById(orderId: number, userId: number, userRole: Role) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        items: {
          include: {
            product: true
          }
        }
      }
    });

    if (!order) {
      throw new AppError('Order not found', 404);
    }

    // Customers can only view their own orders
    if (userRole === Role.CUSTOMER && order.userId !== userId) {
      throw new AppError('Access denied', 403);
    }

    return order;
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
    const products = await prisma.product.findMany({
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
        status: OrderStatus.PENDING,
        items: {
          create: orderItems
        }
      },
      include: {
        items: {
          include: {
            product: true
          }
        }
      }
    });

    // Update stock if enabled
    for (const item of items) {
      const product = products.find(p => p.id === item.productId);
      if (product && product.stockEnabled) {
        await prisma.product.update({
          where: { id: product.id },
          data: { stock: { decrement: item.quantity } }
        });
      }
    }

    return order;
  }

  /**
   * Update order status (Management/Admin only)
   */
  async updateOrderStatus(orderId: number, data: UpdateOrderStatusData) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });

    if (!order) {
      throw new AppError('Order not found', 404);
    }

    return await prisma.order.update({
      where: { id: orderId },
      data: { status: data.status },
      include: {
        items: {
          include: {
            product: true
          }
        }
      }
    });
  }

  /**
   * Add item to existing order (Management/Admin only)
   */
  async addItemToOrder(orderId: number, data: AddOrderItemData) {
    const order = await prisma.order.findUnique({ 
      where: { id: orderId },
      include: { items: true }
    });

    if (!order) {
      throw new AppError('Order not found', 404);
    }

    const product = await prisma.product.findUnique({ 
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
      where: { id: itemId, orderId },
      include: { product: true }
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
      where: { id: orderId },
      include: { items: true }
    });

    if (order) {
      const newTotal = order.items
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
      where: { id: orderId },
      include: { items: true }
    });

    if (order) {
      const newTotal = order.items
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
