import { Router } from 'express';
import { body } from 'express-validator';
import orderController from '../controllers/order.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorizeManagement, authorizeAdmin } from '../middleware/role.middleware';

const router = Router();

/**
 * @route   GET /api/orders
 * @desc    Get all orders (filtered by role)
 * @access  Private (All authenticated users)
 */
router.get('/', authenticate, orderController.getAllOrders);

/**
 * @route   GET /api/orders/:id
 * @desc    Get order by ID
 * @access  Private (All authenticated users)
 */
router.get('/:id', authenticate, orderController.getOrderById);

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
    body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1')
  ],
  orderController.createOrder
);

/**
 * @route   PATCH /api/orders/:id/status
 * @desc    Update order status
 * @access  Private (Management/Admin only)
 */
router.patch(
  '/:id/status',
  authenticate,
  authorizeManagement,
  [
    body('status')
      .isIn(['PENDING', 'APPROVED', 'NOT_FULFILLING', 'READY_FOR_DELIVERY', 'OUT_FOR_DELIVERY', 'DELIVERED'])
      .withMessage('Invalid order status')
  ],
  orderController.updateOrderStatus
);

/**
 * @route   POST /api/orders/:id/items
 * @desc    Add item to order
 * @access  Private (Management/Admin only)
 */
router.post(
  '/:id/items',
  authenticate,
  authorizeManagement,
  [
    body('productId').isInt().withMessage('Valid product ID is required'),
    body('quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1')
  ],
  orderController.addItemToOrder
);

/**
 * @route   PATCH /api/orders/:id/items/:itemId/void
 * @desc    Void order item
 * @access  Private (Management/Admin only)
 */
router.patch('/:id/items/:itemId/void', authenticate, authorizeManagement, orderController.voidOrderItem);

/**
 * @route   DELETE /api/orders/:id/items/:itemId
 * @desc    Delete order item
 * @access  Private (Management/Admin only)
 */
router.delete('/:id/items/:itemId', authenticate, authorizeManagement, orderController.deleteOrderItem);

/**
 * @route   DELETE /api/orders/:id
 * @desc    Delete entire order
 * @access  Private (Admin only)
 */
router.delete('/:id', authenticate, authorizeAdmin, orderController.deleteOrder);

export default router;
