import { Router } from 'express';
import printJobController from '../controllers/printJob.controller';
import { authenticatePrintAgent } from '../middleware/printAgentAuth.middleware';

const router = Router();

router.post('/claim', authenticatePrintAgent, printJobController.claimNextJob.bind(printJobController));
router.post('/:id/success', authenticatePrintAgent, printJobController.markSuccess.bind(printJobController));
router.post('/:id/failure', authenticatePrintAgent, printJobController.markFailure.bind(printJobController));

export default router;
