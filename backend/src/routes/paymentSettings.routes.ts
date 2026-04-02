import { Router } from 'express';
import { PaymentSettingsController } from '../controllers/paymentSettings.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorizeAdmin } from '../middleware/role.middleware';

const router = Router();
const paymentSettingsController = new PaymentSettingsController();

/**
 * @route   GET /api/payment-settings
 * @desc    Get payment settings (admin only)
 * @access  Private (Admin only)
 */
router.get('/', authenticate, authorizeAdmin, paymentSettingsController.getPaymentSettings);

/**
 * @route   PUT /api/payment-settings
 * @desc    Update payment settings (admin only)
 * @access  Private (Admin only)
 */
router.put('/', authenticate, authorizeAdmin, paymentSettingsController.updatePaymentSettings);

export default router;
