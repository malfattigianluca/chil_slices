import { Router } from 'express';
import * as ctrl from './auth.controller';
import { authenticate, requireRole } from '../../middleware/auth.middleware';

const router = Router();

router.post('/login', ctrl.login);
router.post('/register', authenticate, requireRole('admin'), ctrl.register);
router.get('/profile', authenticate, ctrl.profile);
router.put('/password', authenticate, ctrl.changePassword);

export default router;
