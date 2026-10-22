import { Router } from 'express';
import { PlanController } from '../controllers/plan.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/active', PlanController.getActivePlan);
router.post('/generate', PlanController.generatePlan);
router.put('/items/:itemId', PlanController.updatePlanItem);

router.post('/rest-day/checkin', PlanController.claimRestDay);

export default router;