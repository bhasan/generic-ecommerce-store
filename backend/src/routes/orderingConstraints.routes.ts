import { Router } from 'express';
import { OrderingConstraintsController } from '../controllers/orderingConstraints.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorizeAdmin } from '../middleware/role.middleware';

const router = Router();
const orderingConstraintsController = new OrderingConstraintsController();

/**
 * @route   GET /api/ordering-constraints
 * @desc    Get ordering constraints (admin only)
 * @access  Private (Admin only)
 */
router.get('/', authenticate, authorizeAdmin, orderingConstraintsController.getOrderingConstraints);

/**
 * @route   PUT /api/ordering-constraints
 * @desc    Update ordering constraints (admin only)
 * @access  Private (Admin only)
 */
router.put('/', authenticate, authorizeAdmin, orderingConstraintsController.updateOrderingConstraints);

export default router;
