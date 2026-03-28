import { Router } from 'express';
import * as ctrl from './client.controller';
import { authenticate } from '../../middleware/auth.middleware';

const router = Router();
router.use(authenticate);

router.get('/', ctrl.getAll);
router.get('/fuzzy', ctrl.fuzzySearch); // debe ir antes de /:id
router.get('/:id', ctrl.getById);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);
router.post('/import/csv', ctrl.uploadMiddleware, ctrl.importCSV);
router.post('/import/arba-padron', ctrl.uploadMiddleware, ctrl.importArbaPadron);

export default router;
