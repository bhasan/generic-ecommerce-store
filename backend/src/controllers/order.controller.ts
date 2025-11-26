import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import orderService from '../services/order.service';

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
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      const order = await orderService.createOrder({
        userId: req.user.userId,
        items: req.body.items
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

      const order = await orderService.updateOrderStatus(id, req.body);
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
