import { Router } from 'express';
import { body } from 'express-validator';
import orderController from '../controllers/order.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorizeEmployee, authorizeAdmin, authorize } from '../middleware/role.middleware';
import { DeliveryMethod, PaymentMethod } from '../constants/orderMethods';
import { OrderStatus } from '../../generated/prisma';
import { asyncHandler } from '../utils/asyncHandler.util';
import { deliveryAddressValidators, conditionalDeliveryAddressValidators } from '../validators/deliveryAddress';
import { requireIntParam } from '../middleware/parseParam.middleware';

const router = Router();


// Order listing uses the authenticated user's roles to decide which records the service returns.
router.get('/', authenticate, asyncHandler(orderController.getAllOrders));

// Delivery boards read from dedicated status buckets so staff screens can refresh them independently.
router.get('/ready-for-delivery', authenticate, authorize('ADMIN', 'MANAGEMENT', 'DELIVERY_DRIVER'), asyncHandler(orderController.getReadyForDeliveryOrders));
router.get('/out-for-delivery', authenticate, authorize('ADMIN', 'MANAGEMENT', 'DELIVERY_DRIVER'), asyncHandler(orderController.getOutForDeliveryOrders));
router.get('/delivered', authenticate, authorizeAdmin, asyncHandler(orderController.getDeliveredOrders));
router.get('/:id', authenticate, requireIntParam('id', 'order'), asyncHandler(orderController.getOrderById));

router.post(
  '/:id/arrive',
  authenticate,
  requireIntParam('id', 'order'),
  [
    body('parkingSpot').isString().withMessage('Parking spot details are required').trim().notEmpty().withMessage('Parking spot details are required'),
  ],
  asyncHandler(orderController.customerArrive)
);

router.post('/delivery-eligibility', authenticate, [...deliveryAddressValidators], asyncHandler(orderController.checkDeliveryEligibility));

// Checkout requests land here after cart submission and fan into validation plus order creation.
router.post(
  '/',
  authenticate,
  [
    body('items').isArray({ min: 1 }).withMessage('Order must contain at least one item'),
    body('items.*.variantId').isInt().withMessage('Valid variant ID is required'),
    body('items.*.quantity').isFloat({ min: 0.01 }).withMessage('Quantity must be greater than 0'),
    body('cashAppUsername').optional().isString().withMessage('CashApp username must be a string'),
    body('paymentMethod').optional().isIn(Object.values(PaymentMethod)).withMessage('Payment method must be EXTERNAL, STORE_CREDIT, or IN_STORE'),
    body('deliveryMethod').isIn(Object.values(DeliveryMethod)).withMessage('Delivery method must be DELIVERY or PICKUP'),
    ...conditionalDeliveryAddressValidators,
    body('vehicleDescription').optional().isString().trim().notEmpty().withMessage('Vehicle description must be a non-empty string'),
  ],
  asyncHandler(orderController.createOrder)
);

router.post('/:id/payment/token', authenticate, requireIntParam('id', 'order'), asyncHandler(orderController.getPaymentToken));
router.post(
  '/:id/payment/verify',
  authenticate,
  requireIntParam('id', 'order'),
  [body('transId').isString().notEmpty().withMessage('transId is required')],
  asyncHandler(orderController.verifyPayment)
);

router.patch(
  '/:id/status',
  authenticate,
  requireIntParam('id', 'order'),
  [
    body('status').isIn(Object.values(OrderStatus)).withMessage('Invalid order status'),
    body('note').optional().isString().isLength({ max: 500 }).withMessage('Note must be a string under 500 characters'),
  ],
  asyncHandler(orderController.updateOrderStatus)
);

// Staff order edits reuse the same order detail flow after the kanban/detail UI opens an order.
router.post(
  '/:id/items',
  authenticate,
  authorizeEmployee,
  requireIntParam('id', 'order'),
  [
    body('variantId').isInt().withMessage('Valid variant ID is required'),
    body('quantity').isFloat({ min: 0.01 }).withMessage('Quantity must be greater than 0'),
  ],
  asyncHandler(orderController.addItemToOrder)
);

router.patch('/:id/items/:itemId/void', authenticate, authorizeEmployee, requireIntParam('id', 'order'), requireIntParam('itemId', 'item'), asyncHandler(orderController.voidOrderItem));
router.delete('/:id/items/:itemId', authenticate, authorizeEmployee, requireIntParam('id', 'order'), requireIntParam('itemId', 'item'), asyncHandler(orderController.deleteOrderItem));
router.post('/:id/print', authenticate, authorizeEmployee, requireIntParam('id', 'order'), asyncHandler(orderController.printOrderReceipt));
// Only admins can hard-delete orders.
router.delete('/:id', authenticate, authorizeAdmin, requireIntParam('id', 'order'), asyncHandler(orderController.deleteOrder));

export default router;
