import { Request, Response } from 'express';
import orderService from '../services/order.service';
import { successResponse } from '../utils/responseEnvelope';
import { DeliveryEligibilityService } from '../services/deliveryEligibility.service';
import { logger } from '../utils/logger';
import { ROLES, hasAnyRole, hasRole } from '../constants/roles';
import { OrderStatus } from '../../generated/prisma';
import { validateRequest, parsePaginationQuery } from '../utils/request.util';

const deliveryEligibilityService = new DeliveryEligibilityService();

export class OrderController {
  async getAllOrders(req: Request, res: Response) : Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    const { limit, offset } = parsePaginationQuery(
      req.query as { limit?: string; offset?: string },
      { defaultLimit: 100, maxLimit: 500 },
    );
    const orders = await orderService.getAllOrders(req.user.userId, req.user.roles, limit, offset);
    res.status(200).json(successResponse(orders));
  }

  async getReadyForDeliveryOrders(_req: Request, res: Response) : Promise<void> {
    const orders = await orderService.getReadyForDeliveryOrders();
    res.status(200).json(successResponse(orders));
  }

  async getOutForDeliveryOrders(_req: Request, res: Response) : Promise<void> {
    const orders = await orderService.getOutForDeliveryOrders();
    res.status(200).json(successResponse(orders));
  }

  async getDeliveredOrders(_req: Request, res: Response) : Promise<void> {
    const orders = await orderService.getDeliveredOrders();
    res.status(200).json(successResponse(orders));
  }

  async getOrderById(req: Request, res: Response) : Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    const id = parseInt(req.params.id, 10);
    const order = await orderService.getOrderById(id, req.user.userId, req.user.roles);
    res.status(200).json(successResponse(order));
  }

  async checkDeliveryEligibility(req: Request, res: Response) : Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (!validateRequest(req, res)) return;
    const result = await deliveryEligibilityService.checkDeliveryEligibility(req.body.deliveryAddress);
    res.status(200).json(successResponse({
      deliverable: result.deliverable,
      deliveryStatus: result.deliveryStatus,
      deliverySource: result.deliverySource,
      distanceMiles: result.distanceMiles,
      thresholdMiles: result.thresholdMiles,
      message: result.message,
    }));
  }

  async createOrder(req: Request, res: Response) : Promise<void> {
    if (!req.user) {
      logger.warn('Order creation failed: authentication required', { path: req.path, ip: req.ip });
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (!validateRequest(req, res)) return;
    const order = await orderService.createOrder({
      userId: req.user.userId,
      items: req.body.items,
      cashAppUsername: req.body.cashAppUsername,
      deliveryMethod: req.body.deliveryMethod,
      deliveryAddress: req.body.deliveryAddress,
      vehicleDescription: req.body.vehicleDescription,
      paymentMethod: req.body.paymentMethod,
    });
    logger.logEvent('order.created', {
      requestId: req.requestId,
      orderId: order.id,
      userId: req.user.userId,
      total: order.total,
      deliveryMethod: req.body.deliveryMethod,
      paymentMethod: req.body.paymentMethod,
      itemCount: req.body.items?.length || 0,
    });
    res.status(201).json(successResponse({ order }, 'Order created successfully'));
  }

  async updateOrderStatus(req: Request, res: Response) : Promise<void> {
    const id = parseInt(req.params.id, 10);
    if (!validateRequest(req, res)) return;
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    const userRoles = req.user.roles || [];
    const isEmployee = hasRole(userRoles, ROLES.EMPLOYEE);
    const isManagementOrAdmin = hasRole(userRoles, ROLES.MANAGEMENT) || hasRole(userRoles, ROLES.ADMIN);
    const canManageOrders = isEmployee || isManagementOrAdmin;
    const isDeliveryDriver = hasRole(userRoles, ROLES.DELIVERY_DRIVER) && !canManageOrders;

    // Delivery drivers only complete the final handoff step; broader order edits stay with staff roles.
    if (isDeliveryDriver && req.body.status !== OrderStatus.DELIVERED) {
      res.status(403).json({ error: 'Delivery drivers can only mark orders as DELIVERED' });
      return;
    }
    if (!canManageOrders && !isDeliveryDriver) {
      res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
      return;
    }
    const order = await orderService.updateOrderStatus(id, { ...req.body, changedBy: req.user.userId }, userRoles);
    logger.logEvent('order.status_changed', {
      requestId: req.requestId,
      orderId: id,
      toStatus: req.body.status,
      changedBy: req.user.userId,
      changedByRoles: userRoles,
    });
    res.status(200).json(successResponse({ order }, 'Order status updated successfully'));
  }

  async addItemToOrder(req: Request, res: Response) : Promise<void> {
    const id = parseInt(req.params.id, 10);
    // Validation keeps manual staff edits aligned with checkout quantity rules before the service mutates totals.
    if (!validateRequest(req, res)) return;
    const orderItem = await orderService.addItemToOrder(id, req.body);
    res.status(201).json(successResponse({ orderItem }, 'Item added to order successfully'));
  }

  async voidOrderItem(req: Request, res: Response) : Promise<void> {
    const orderId = parseInt(req.params.id, 10);
    const itemId = parseInt(req.params.itemId, 10);
    const orderItem = await orderService.voidOrderItem(orderId, itemId);
    res.status(200).json(successResponse({ orderItem }, 'Order item voided successfully'));
  }

  async deleteOrderItem(req: Request, res: Response) : Promise<void> {
    const orderId = parseInt(req.params.id, 10);
    const itemId = parseInt(req.params.itemId, 10);
    const result = await orderService.deleteOrderItem(orderId, itemId);
    res.status(200).json(successResponse(result));
  }

  async deleteOrder(req: Request, res: Response) : Promise<void> {
    if (!req.user) { res.status(401).json({ error: 'Authentication required' }); return; }
    const id = parseInt(req.params.id, 10);

    const isStaff = hasAnyRole(req.user.roles as any, [ROLES.ADMIN, ROLES.MANAGEMENT, ROLES.EMPLOYEE]);
    const result = await orderService.deleteOrder(id, isStaff ? null : req.user.userId);
    res.status(200).json(successResponse(result));
  }

  async printOrderReceipt(req: Request, res: Response) : Promise<void> {
    const id = parseInt(req.params.id, 10);
    const result = await orderService.printOrderReceipt(id, {
      actor: { userId: req.user?.userId, username: req.user?.username },
    });
    const msg = result.queued
      ? 'Order receipt queued for printing'
      : 'Printer is not configured; receipt was not queued';
    res.status(202).json(successResponse({ result }, msg));
  }

  async customerArrive(req: Request, res: Response) : Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (!validateRequest(req, res)) return;
    const id = parseInt(req.params.id, 10);
    const order = await orderService.customerArrive(id, req.user.userId, req.body.parkingSpot);
    res.status(200).json(successResponse({ order }, 'Arrival notification sent successfully'));
  }

  async getPaymentToken(req: Request, res: Response) : Promise<void> {
    const orderId = parseInt(req.params.id, 10);
    const userId = req.user!.userId;
    const result = await orderService.getPaymentToken(orderId, userId);
    res.status(200).json(successResponse(result));
  }

  async verifyPayment(req: Request, res: Response) : Promise<void> {
    const orderId = parseInt(req.params.id, 10);
    if (!validateRequest(req, res)) return;
    const userId = req.user!.userId;
    const { transId } = req.body;
    const result = await orderService.confirmCardPayment(orderId, userId, transId);
    logger.logEvent('payment.succeeded', {
      requestId: req.requestId,
      orderId,
      userId,
      transId,
    });
    res.status(200).json(successResponse({ order: result }, 'Payment confirmed'));
  }
}

export default new OrderController();
