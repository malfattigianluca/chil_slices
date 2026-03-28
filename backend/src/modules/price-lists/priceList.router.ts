import { Router } from 'express';
import * as ctrl from './priceList.controller';
import { authenticate } from '../../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/', ctrl.getAll);
router.get('/active', ctrl.getActive);
router.get('/:id', ctrl.getById);
router.post('/upload', ctrl.upload.single('file'), ctrl.uploadAndCreate);
router.post('/preview', ctrl.upload.single('file'), ctrl.previewPDF);
router.post('/manual', ctrl.createManual);
router.put('/:id/activate', ctrl.activate);
router.delete('/:id', ctrl.deleteList);
router.put('/products/:productId', ctrl.editProduct);

export default router;
