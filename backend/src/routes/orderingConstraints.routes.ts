import { Router } from 'express';
import { OrderingConstraintsController } from '../controllers/orderingConstraints.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorizeAdmin } from '../middleware/role.middleware';
import { asyncHandler } from '../utils/asyncHandler.util';

const router = Router();
const orderingConstraintsController = new OrderingConstraintsController();

router.get('/', authenticate, authorizeAdmin, asyncHandler(orderingConstraintsController.getOrderingConstraints));
router.put('/', authenticate, authorizeAdmin, asyncHandler(orderingConstraintsController.updateOrderingConstraints));

export default router;
