import { Request, Response } from 'express';
import orderService from '../services/order.service';
import { DeliveryEligibilityService } from '../services/deliveryEligibility.service';
import { logger } from '../utils/logger';
import { ROLES } from '../constants/roles';
import { OrderStatus } from '../../generated/prisma';
import { validateRequest, parseIntParam, parseOptionalIntQuery } from '../utils/request.util';

const deliveryEligibilityService = new DeliveryEligibilityService();

export class OrderController {
  async getAllOrders(req: Request, res: Response) : Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    const limit = parseOptionalIntQuery(req.query.limit as string | undefined);
    const offset = parseOptionalIntQuery(req.query.offset as string | undefined);
    const orders = await orderService.getAllOrders(req.user.userId, req.user.roles, limit, offset);
    res.status(200).json(orders);
  }

  async getReadyForDeliveryOrders(_req: Request, res: Response) : Promise<void> {
    const orders = await orderService.getReadyForDeliveryOrders();
    res.status(200).json(orders);
  }

  async getOutForDeliveryOrders(_req: Request, res: Response) : Promise<void> {
    const orders = await orderService.getOutForDeliveryOrders();
    res.status(200).json(orders);
  }

  async getDeliveredOrders(_req: Request, res: Response) : Promise<void> {
    const orders = await orderService.getDeliveredOrders();
    res.status(200).json(orders);
  }

  async getOrderById(req: Request, res: Response) : Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    const id = parseIntParam(req.params.id, res, 'order');
    if (id === null) return;
    const order = await orderService.getOrderById(id, req.user.userId, req.user.roles);
    res.status(200).json(order);
  }

  async checkDeliveryEligibility(req: Request, res: Response) : Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (!validateRequest(req, res)) return;
    const result = await deliveryEligibilityService.checkDeliveryEligibility(req.body.deliveryAddress);
    res.status(200).json({
      deliverable: result.deliverable,
      deliveryStatus: result.deliveryStatus,
      deliverySource: result.deliverySource,
      distanceMiles: result.distanceMiles,
      thresholdMiles: result.thresholdMiles,
      message: result.message,
    });
  }

  async createOrder(req: Request, res: Response) : Promise<void> {
    if (!req.user) {
      logger.warn('Order creation failed: authentication required', { path: req.path, ip: req.ip });
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (!validateRequest(req, res)) return;
    logger.info('Order creation request received', {
      userId: req.user.userId,
      itemCount: req.body.items?.length || 0,
    });
    const order = await orderService.createOrder({
      userId: req.user.userId,
      items: req.body.items,
      cashAppUsername: req.body.cashAppUsername,
      deliveryMethod: req.body.deliveryMethod,
      deliveryAddress: req.body.deliveryAddress,
      vehicleDescription: req.body.vehicleDescription,
      paymentMethod: req.body.paymentMethod,
    });
    logger.info('Order created successfully via API', {
      orderId: order.id,
      userId: req.user.userId,
      total: order.total,
    });
    res.status(201).json({ message: 'Order created successfully', order });
  }

  async updateOrderStatus(req: Request, res: Response) : Promise<void> {
    const id = parseIntParam(req.params.id, res, 'order');
    if (id === null) return;
    if (!validateRequest(req, res)) return;
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
    res.status(200).json({ message: 'Order status updated successfully', order });
  }

  async addItemToOrder(req: Request, res: Response) : Promise<void> {
    const id = parseIntParam(req.params.id, res, 'order');
    if (id === null) return;
    // Validation keeps manual staff edits aligned with checkout quantity rules before the service mutates totals.
    if (!validateRequest(req, res)) return;
    const orderItem = await orderService.addItemToOrder(id, req.body);
    res.status(201).json({ message: 'Item added to order successfully', orderItem });
  }

  async voidOrderItem(req: Request, res: Response) : Promise<void> {
    const orderId = parseIntParam(req.params.id, res, 'order');
    if (orderId === null) return;
    const itemId = parseIntParam(req.params.itemId, res, 'item');
    if (itemId === null) return;
    const orderItem = await orderService.voidOrderItem(orderId, itemId);
    res.status(200).json({ message: 'Order item voided successfully', orderItem });
  }

  async deleteOrderItem(req: Request, res: Response) : Promise<void> {
    const orderId = parseIntParam(req.params.id, res, 'order');
    if (orderId === null) return;
    const itemId = parseIntParam(req.params.itemId, res, 'item');
    if (itemId === null) return;
    const result = await orderService.deleteOrderItem(orderId, itemId);
    res.status(200).json(result);
  }

  async deleteOrder(req: Request, res: Response) : Promise<void> {
    const id = parseIntParam(req.params.id, res, 'order');
    if (id === null) return;
    const result = await orderService.deleteOrder(id);
    res.status(200).json(result);
  }

  async printOrderReceipt(req: Request, res: Response) : Promise<void> {
    const id = parseIntParam(req.params.id, res, 'order');
    if (id === null) return;
    const result = await orderService.printOrderReceipt(id, {
      actor: { userId: req.user?.userId, username: req.user?.username },
    });
    res.status(202).json({
      message: result.queued
        ? 'Order receipt queued for printing'
        : 'Printer is not configured; receipt was not queued',
      result,
    });
  }

  async customerArrive(req: Request, res: Response) : Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (!validateRequest(req, res)) return;
    const id = parseIntParam(req.params.id, res, 'order');
    if (id === null) return;
    const order = await orderService.customerArrive(id, req.user.userId, req.body.parkingSpot);
    res.status(200).json({ message: 'Arrival notification sent successfully', order });
  }

  async getPaymentToken(req: Request, res: Response) : Promise<void> {
    const orderId = parseIntParam(req.params.id, res, 'order');
    if (orderId === null) return;
    const userId = req.user!.userId;
    const result = await orderService.getPaymentToken(orderId, userId);
    res.status(200).json(result);
  }

  async verifyPayment(req: Request, res: Response) : Promise<void> {
    const orderId = parseIntParam(req.params.id, res, 'order');
    if (orderId === null) return;
    if (!validateRequest(req, res)) return;
    const userId = req.user!.userId;
    const { transId } = req.body;
    const result = await orderService.confirmCardPayment(orderId, userId, transId);
    res.status(200).json({ message: 'Payment confirmed', order: result });
  }
}

export default new OrderController();
