import { Router } from 'express';
import { body } from 'express-validator';
import orderController from '../controllers/order.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorizeEmployee, authorizeAdmin, authorize } from '../middleware/role.middleware';
import { DeliveryMethod, PaymentMethod } from '../constants/orderMethods';
import { OrderStatus } from '../../generated/prisma';
import { asyncHandler } from '../utils/asyncHandler.util';
import { deliveryAddressValidators, conditionalDeliveryAddressValidators } from '../validators/deliveryAddress';

const router = Router();


// Order listing uses the authenticated user's roles to decide which records the service returns.
router.get('/', authenticate, asyncHandler(orderController.getAllOrders));

// Delivery boards read from dedicated status buckets so staff screens can refresh them independently.
router.get('/ready-for-delivery', authenticate, authorize('ADMIN', 'MANAGEMENT', 'DELIVERY_DRIVER'), asyncHandler(orderController.getReadyForDeliveryOrders));
router.get('/out-for-delivery', authenticate, authorize('ADMIN', 'MANAGEMENT', 'DELIVERY_DRIVER'), asyncHandler(orderController.getOutForDeliveryOrders));
router.get('/delivered', authenticate, authorizeAdmin, asyncHandler(orderController.getDeliveredOrders));
router.get('/:id', authenticate, asyncHandler(orderController.getOrderById));

router.post(
  '/:id/arrive',
  authenticate,
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
    body('items.*.productId').isInt().withMessage('Valid product ID is required'),
    body('items.*.quantity').isFloat({ min: 0.01 }).withMessage('Quantity must be greater than 0'),
    body('cashAppUsername').optional().isString().withMessage('CashApp username must be a string'),
    body('paymentMethod').optional().isIn(Object.values(PaymentMethod)).withMessage('Payment method must be EXTERNAL, CREDIT, or IN_STORE'),
    body('deliveryMethod').isIn(Object.values(DeliveryMethod)).withMessage('Delivery method must be DELIVERY or PICKUP'),
    ...conditionalDeliveryAddressValidators,
    body('vehicleDescription').optional().isString().trim().notEmpty().withMessage('Vehicle description must be a non-empty string'),
  ],
  asyncHandler(orderController.createOrder)
);

router.post('/:id/payment/token', authenticate, asyncHandler(orderController.getPaymentToken));
router.post(
  '/:id/payment/verify',
  authenticate,
  [body('transId').isString().notEmpty().withMessage('transId is required')],
  asyncHandler(orderController.verifyPayment)
);

router.patch(
  '/:id/status',
  authenticate,
  [body('status').isIn(Object.values(OrderStatus)).withMessage('Invalid order status')],
  asyncHandler(orderController.updateOrderStatus)
);

// Staff order edits reuse the same order detail flow after the kanban/detail UI opens an order.
router.post(
  '/:id/items',
  authenticate,
  authorizeEmployee,
  [
    body('productId').isInt().withMessage('Valid product ID is required'),
    body('quantity').isFloat({ min: 0.01 }).withMessage('Quantity must be greater than 0'),
  ],
  asyncHandler(orderController.addItemToOrder)
);

router.patch('/:id/items/:itemId/void', authenticate, authorizeEmployee, asyncHandler(orderController.voidOrderItem));
router.delete('/:id/items/:itemId', authenticate, authorizeEmployee, asyncHandler(orderController.deleteOrderItem));
router.post('/:id/print', authenticate, authorizeEmployee, asyncHandler(orderController.printOrderReceipt));
router.delete('/:id', authenticate, authorizeAdmin, asyncHandler(orderController.deleteOrder));

export default router;
