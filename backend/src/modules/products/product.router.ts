import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import * as service from './product.service';
import { z } from 'zod';
import { Request, Response } from 'express';

const router = Router();
router.use(authenticate);

router.get('/list/:listId', async (req: Request, res: Response) => {
  const listId = parseInt(req.params.listId);
  const search = req.query.search as string | undefined;
  res.json(await service.getByList(listId, search));
});

router.get('/:id', async (req: Request, res: Response) => {
  res.json(await service.getById(parseInt(req.params.id)));
});

router.post('/', async (req: Request, res: Response) => {
  const data = z.object({
    codigo: z.string(),
    descripcion: z.string(),
    precioUnidad: z.number(),
    precioBulto: z.number().nullable().optional(),
    ivaPorcentaje: z.number().optional(),
    listaPrecioId: z.number(),
  }).parse(req.body);
  res.status(201).json(await service.create(data));
});

router.put('/:id', async (req: Request, res: Response) => {
  const data = z.object({
    descripcion: z.string().optional(),
    precioUnidad: z.number().optional(),
    precioBulto: z.number().nullable().optional(),
    ivaPorcentaje: z.number().optional(),
    activo: z.boolean().optional(),
  }).parse(req.body);
  res.json(await service.update(parseInt(req.params.id), data));
});

router.delete('/:id', async (req: Request, res: Response) => {
  res.json(await service.remove(parseInt(req.params.id)));
});

export default router;
