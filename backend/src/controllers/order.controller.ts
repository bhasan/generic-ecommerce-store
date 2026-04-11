import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import orderService from '../services/order.service';
import { logger } from '../utils/logger';
import { ROLES } from '../constants/roles';
import { OrderStatus } from '../../generated/prisma';

export class OrderController {
  /**
   * Get all orders
   * GET /api/orders
   */
  async getAllOrders(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const orders = await orderService.getAllOrders(req.user.userId, req.user.roles);
      res.status(200).json(orders);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get ready-for-delivery orders
   * GET /api/orders/ready-for-delivery
   */
  async getReadyForDeliveryOrders(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orders = await orderService.getReadyForDeliveryOrders();
      res.status(200).json(orders);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get out-for-delivery orders
   * GET /api/orders/out-for-delivery
   */
  async getOutForDeliveryOrders(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orders = await orderService.getOutForDeliveryOrders();
      res.status(200).json(orders);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get delivered orders
   * GET /api/orders/delivered
   */
  async getDeliveredOrders(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orders = await orderService.getDeliveredOrders();
      res.status(200).json(orders);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get order by ID
   * GET /api/orders/:id
   */
  async getOrderById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid order ID' });
        return;
      }

      const order = await orderService.getOrderById(id, req.user.userId, req.user.roles);
      res.status(200).json(order);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create order (checkout)
   * POST /api/orders
   */
  async createOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        logger.warn('Order creation failed: authentication required', {
          path: req.path,
          ip: req.ip,
        });
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.warn('Order creation failed: validation errors', {
          userId: req.user.userId,
          errors: errors.array(),
        });
        res.status(400).json({ errors: errors.array() });
        return;
      }

      // Log the incoming checkout shape before the service calculates totals and payment side effects.
      logger.info('Order creation request received', {
        userId: req.user.userId,
        itemCount: req.body.items?.length || 0,
      });

      const order = await orderService.createOrder({
        userId: req.user.userId,
        items: req.body.items,
        cashAppUsername: req.body.cashAppUsername,
        deliveryMethod: req.body.deliveryMethod,
        paymentMethod: req.body.paymentMethod
      });

      logger.info('Order created successfully via API', {
        orderId: order.id,
        userId: req.user.userId,
        total: order.total,
      });

      res.status(201).json({
        message: 'Order created successfully',
        order
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update order status
   * PATCH /api/orders/:id/status
   */
  async updateOrderStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid order ID' });
        return;
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      // Check authorization: Management/Admin can update to any status, Delivery Driver can only mark as DELIVERED
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const userRoles = req.user.roles || [];
      const isEmployee = userRoles.includes(ROLES.EMPLOYEE);
      const isManagementOrAdmin = userRoles.includes(ROLES.MANAGEMENT) || userRoles.includes(ROLES.ADMIN);
      const canManageOrders = isEmployee || isManagementOrAdmin;
      const isDeliveryDriver = userRoles.includes(ROLES.DELIVERY_DRIVER) && !canManageOrders;

      // Delivery drivers only complete the final handoff step; broader order edits stay with staff roles.
      if (isDeliveryDriver && req.body.status !== OrderStatus.DELIVERED) {
        res.status(403).json({ error: 'Delivery drivers can only mark orders as DELIVERED' });
        return;
      }

      if (!canManageOrders && !isDeliveryDriver) {
        res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
        return;
      }

      const order = await orderService.updateOrderStatus(id, req.body, userRoles);
      res.status(200).json({
        message: 'Order status updated successfully',
        order
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Add item to order
   * POST /api/orders/:id/items
   */
  async addItemToOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid order ID' });
        return;
      }

      // Validation keeps manual staff edits aligned with checkout quantity rules before the service mutates totals.
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      const orderItem = await orderService.addItemToOrder(id, req.body);
      res.status(201).json({
        message: 'Item added to order successfully',
        orderItem
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Void order item
   * PATCH /api/orders/:id/items/:itemId/void
   */
  async voidOrderItem(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orderId = parseInt(req.params.id);
      const itemId = parseInt(req.params.itemId);

      if (isNaN(orderId) || isNaN(itemId)) {
        res.status(400).json({ error: 'Invalid order or item ID' });
        return;
      }

      const orderItem = await orderService.voidOrderItem(orderId, itemId);
      res.status(200).json({
        message: 'Order item voided successfully',
        orderItem
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete order item
   * DELETE /api/orders/:id/items/:itemId
   */
  async deleteOrderItem(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orderId = parseInt(req.params.id);
      const itemId = parseInt(req.params.itemId);

      if (isNaN(orderId) || isNaN(itemId)) {
        res.status(400).json({ error: 'Invalid order or item ID' });
        return;
      }

      const result = await orderService.deleteOrderItem(orderId, itemId);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete order
   * DELETE /api/orders/:id
   */
  async deleteOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid order ID' });
        return;
      }

      const result = await orderService.deleteOrder(id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
}

export default new OrderController();
