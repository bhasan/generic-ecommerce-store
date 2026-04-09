import { Router } from 'express';
import { body } from 'express-validator';
import orderController from '../controllers/order.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorizeEmployee, authorizeAdmin, authorize } from '../middleware/role.middleware';

const router = Router();
const deliveryAddressValidators = [
  body('deliveryAddress').isObject().withMessage('Delivery address is required'),
  body('deliveryAddress.street').isString().trim().notEmpty().withMessage('Delivery street is required'),
  body('deliveryAddress.apartment').optional().isString().withMessage('Delivery apartment must be a string'),
  body('deliveryAddress.city').isString().trim().notEmpty().withMessage('Delivery city is required'),
  body('deliveryAddress.state').isString().trim().isLength({ min: 2, max: 2 }).withMessage('Delivery state must be a 2-letter code'),
  body('deliveryAddress.zipCode').isString().trim().matches(/^\d{5}(-\d{4})?$/).withMessage('Delivery ZIP code must be a valid ZIP code'),
];

// Order listing uses the authenticated user's roles to decide which records the service returns.
/**
 * @route   GET /api/orders
 * @desc    Get all orders (filtered by role)
 * @access  Private (All authenticated users)
 */
router.get('/', authenticate, orderController.getAllOrders);

// Delivery boards read from dedicated status buckets so staff screens can refresh them independently.
/**
 * @route   GET /api/orders/ready-for-delivery
 * @desc    Get ready-for-delivery orders
 * @access  Private (Admin, Management, Delivery Driver)
 */
router.get('/ready-for-delivery', authenticate, authorize('ADMIN', 'MANAGEMENT', 'DELIVERY_DRIVER'), orderController.getReadyForDeliveryOrders);

/**
 * @route   GET /api/orders/out-for-delivery
 * @desc    Get out-for-delivery orders
 * @access  Private (Admin, Management, Delivery Driver)
 */
router.get('/out-for-delivery', authenticate, authorize('ADMIN', 'MANAGEMENT', 'DELIVERY_DRIVER'), orderController.getOutForDeliveryOrders);

/**
 * @route   GET /api/orders/delivered
 * @desc    Get delivered orders
 * @access  Private (Admin only)
 */
router.get('/delivered', authenticate, authorizeAdmin, orderController.getDeliveredOrders);

/**
 * @route   GET /api/orders/:id
 * @desc    Get order by ID
 * @access  Private (All authenticated users)
 */
router.get('/:id', authenticate, orderController.getOrderById);

/**
 * @route   POST /api/orders/delivery-eligibility
 * @desc    Check whether a delivery address is currently eligible
 * @access  Private (All authenticated users)
 */
router.post(
  '/delivery-eligibility',
  authenticate,
  deliveryAddressValidators,
  orderController.checkDeliveryEligibility
);

// Checkout requests land here after cart submission and fan into validation plus order creation.
/**
 * @route   POST /api/orders
 * @desc    Create order (checkout)
 * @access  Private (Customers and above)
 */
router.post(
  '/',
  authenticate,
  [
    body('items').isArray({ min: 1 }).withMessage('Order must contain at least one item'),
    body('items.*.productId').isInt().withMessage('Valid product ID is required'),
    body('items.*.quantity').isFloat({ min: 0.01 }).withMessage('Quantity must be greater than 0'),
    body('cashAppUsername').optional().isString().withMessage('CashApp username must be a string'),
    body('deliveryMethod').isIn(['DELIVERY', 'PICKUP']).withMessage('Delivery method must be DELIVERY or PICKUP'),
    body('deliveryAddress').custom((value, { req }) => {
      if (req.body.deliveryMethod !== 'DELIVERY') {
        return true;
      }

      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Delivery address is required for delivery orders');
      }

      return true;
    }),
    body('deliveryAddress.street')
      .if((_value, { req }) => req.body.deliveryMethod === 'DELIVERY')
      .isString()
      .trim()
      .notEmpty()
      .withMessage('Delivery street is required'),
    body('deliveryAddress.apartment')
      .optional()
      .isString()
      .withMessage('Delivery apartment must be a string'),
    body('deliveryAddress.city')
      .if((_value, { req }) => req.body.deliveryMethod === 'DELIVERY')
      .isString()
      .trim()
      .notEmpty()
      .withMessage('Delivery city is required'),
    body('deliveryAddress.state')
      .if((_value, { req }) => req.body.deliveryMethod === 'DELIVERY')
      .isString()
      .trim()
      .isLength({ min: 2, max: 2 })
      .withMessage('Delivery state must be a 2-letter code'),
    body('deliveryAddress.zipCode')
      .if((_value, { req }) => req.body.deliveryMethod === 'DELIVERY')
      .isString()
      .trim()
      .matches(/^\d{5}(-\d{4})?$/)
      .withMessage('Delivery ZIP code must be a valid ZIP code')
  ],
  orderController.createOrder
);

/**
 * @route   PATCH /api/orders/:id/status
 * @desc    Update order status
 * @access  Private (Management/Admin for all statuses, Delivery Driver for DELIVERED only)
 */
router.patch(
  '/:id/status',
  authenticate,
  [
    body('status')
      .isIn(['PENDING', 'APPROVED', 'NOT_FULFILLING', 'READY_FOR_DELIVERY', 'OUT_FOR_DELIVERY', 'DELIVERED'])
      .withMessage('Invalid order status')
  ],
  orderController.updateOrderStatus
);

// Staff order edits reuse the same order detail flow after the kanban/detail UI opens an order.
/**
 * @route   POST /api/orders/:id/items
 * @desc    Add item to order
 * @access  Private (Employee/Management/Admin)
 */
router.post(
  '/:id/items',
  authenticate,
  authorizeEmployee,
  [
    body('productId').isInt().withMessage('Valid product ID is required'),
    body('quantity').isFloat({ min: 0.01 }).withMessage('Quantity must be greater than 0')
  ],
  orderController.addItemToOrder
);

/**
 * @route   PATCH /api/orders/:id/items/:itemId/void
 * @desc    Void order item
 * @access  Private (Employee/Management/Admin)
 */
router.patch('/:id/items/:itemId/void', authenticate, authorizeEmployee, orderController.voidOrderItem);

/**
 * @route   DELETE /api/orders/:id/items/:itemId
 * @desc    Delete order item
 * @access  Private (Employee/Management/Admin)
 */
router.delete('/:id/items/:itemId', authenticate, authorizeEmployee, orderController.deleteOrderItem);

/**
 * @route   DELETE /api/orders/:id
 * @desc    Delete entire order
 * @access  Private (Admin only)
 */
router.delete('/:id', authenticate, authorizeAdmin, orderController.deleteOrder);

export default router;
