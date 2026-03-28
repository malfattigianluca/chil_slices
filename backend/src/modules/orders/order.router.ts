import { Router } from 'express';
import * as ctrl from './order.controller';
import { authenticate } from '../../middleware/auth.middleware';

const router = Router();
router.use(authenticate);

router.get('/metrics', ctrl.metrics);
router.get('/', ctrl.getAll);
router.get('/:id', ctrl.getById);
router.get('/:id/pdf', ctrl.exportPDF);
router.post('/preview', ctrl.preview);
router.post('/recalculate', ctrl.recalculate);
router.post('/', ctrl.save);
router.put('/:id/estado', ctrl.updateEstado);
router.delete('/:id', ctrl.deleteOrder);

export default router;
