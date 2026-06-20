import { Router } from 'express';
import { PaymentSettingsController } from '../controllers/paymentSettings.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorizeAdmin } from '../middleware/role.middleware';
import { asyncHandler } from '../utils/asyncHandler.util';

const router = Router();
const paymentSettingsController = new PaymentSettingsController();

router.get('/', authenticate, authorizeAdmin, asyncHandler(paymentSettingsController.getPaymentSettings));
router.put('/', authenticate, authorizeAdmin, asyncHandler(paymentSettingsController.updatePaymentSettings));

export default router;
