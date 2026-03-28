import { Request, Response } from 'express';
import { z } from 'zod';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { config } from '../../config';
import * as service from './client.service';
import { fuzzyMatchClients } from '../../utils/fuzzy-client';

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = path.resolve(config.uploadDir);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
});

const clientSchema = z.object({
  codigo: z.string().min(1),
  cuit: z.string().optional(),
  nombre: z.string().min(1),
  condicionFiscal: z.string().optional(),
  tipoComprobanteHabitual: z.enum(['FC_A', 'REMITO', 'Z', 'MITAD']).optional(),
  aplicaPercepcionIva: z.boolean().optional(),
  alicuotaPercepcionIva: z.number().min(0).max(100).optional(),
  alicuotaPercepcionIibb: z.number().min(0).max(100).nullable().optional(),
  iibbPadronPeriodo: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  direccion: z.string().optional(),
  telefono: z.string().optional(),
  zona: z.string().optional(),
  observaciones: z.string().optional(),
});

export const uploadMiddleware = upload.single('file');

export async function getAll(req: Request, res: Response) {
  const search = req.query.search as string | undefined;
  const clients = await service.getAll(search);
  res.json(clients);
}

export async function fuzzySearch(req: Request, res: Response) {
  const q = (req.query.q as string | undefined)?.trim();
  if (!q) return res.json([]);

  const clients = await service.getAll(); // todos, sin filtro
  const candidates = clients.map((c) => ({ id: c.id, codigo: c.codigo, nombre: c.nombre }));
  const matches = fuzzyMatchClients(q, candidates);
  res.json(matches);
}

export async function getById(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const c = await service.getById(id);
  res.json(c);
}

export async function create(req: Request, res: Response) {
  const data = clientSchema.parse(req.body);
  const c = await service.create(data);
  res.status(201).json(c);
}

export async function update(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const data = clientSchema.partial().parse(req.body);
  const c = await service.update(id, data);
  res.json(c);
}

export async function remove(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  await service.remove(id);
  res.json({ message: 'Cliente eliminado' });
}

export async function importCSV(req: Request, res: Response) {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'Archivo CSV requerido' });
  try {
    const result = await service.importFromCSV(file.path);
    res.json(result);
  } finally {
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
  }
}

export async function importArbaPadron(req: Request, res: Response) {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'Archivo de padrón requerido' });

  const period = z.object({
    periodo: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  }).parse(req.body).periodo;

  try {
    const result = await service.importArbaPadron(file.path, period);
    res.json(result);
  } finally {
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
  }
}
