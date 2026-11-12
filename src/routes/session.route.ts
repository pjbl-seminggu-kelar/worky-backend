import { Router } from 'express';
import { SessionController } from '../controllers/session.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

router.post('/start', SessionController.start);
router.post('/:id/events', SessionController.logEvents);
router.post('/:id/complete', SessionController.complete);
router.post('/:id/abandon', SessionController.abandon);
router.get('/history', SessionController.getHistory);

export default router;