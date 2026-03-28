import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../../middleware/auth.middleware';
import { sendOrderByMail, sendBatchByMail } from './mail.service';

const router = Router();
router.use(authenticate);

const sendSchema = z.object({
  destinatario: z.string().email(),
});

const batchSchema = z.object({
  destinatario: z.string().email(),
});

router.post('/orders/:id/send', async (req: Request, res: Response) => {
  const orderId = parseInt(req.params.id);
  const { destinatario } = sendSchema.parse(req.body);
  const result = await sendOrderByMail({ orderId, destinatario });
  if (result.success) {
    res.json({ ok: true, asunto: result.asunto });
  } else {
    res.status(500).json({ ok: false, error: result.error, asunto: result.asunto });
  }
});

router.post('/batch/send', async (req: AuthRequest, res: Response) => {
  const { destinatario } = batchSchema.parse(req.body);
  const vendedorId = req.user?.id;
  const result = await sendBatchByMail({ destinatario, vendedorId });
  if (result.success) {
    res.json({ ok: true, enviados: result.enviados, omitidos: result.omitidos, asunto: result.asunto });
  } else {
    res.status(500).json({ ok: false, error: result.error, enviados: result.enviados, asunto: result.asunto });
  }
});

export default router;
