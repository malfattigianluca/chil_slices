import { Request, Response } from 'express';
import { z } from 'zod';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { config } from '../../config';
import * as service from './priceList.service';

// Multer storage config
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.resolve(config.uploadDir);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, `${unique}-${file.originalname}`);
  },
});

export const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.csv', '.xlsx'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  },
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});

export async function getAll(_req: Request, res: Response) {
  const lists = await service.getAllPriceLists();
  res.json(lists);
}

export async function getById(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const pl = await service.getPriceListById(id);
  res.json(pl);
}

export async function getActive(_req: Request, res: Response) {
  const pl = await service.getActivePriceList();
  res.json(pl || null);
}

export async function uploadAndCreate(req: Request, res: Response) {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'Archivo requerido' });

  const body = z.object({
    nombre: z.string().min(1),
    version: z.string().optional(),
    vigente: z.string().optional(),
    ivaPorcentaje: z.string().optional(),
  }).parse(req.body);

  let products: service.ExtractedProduct[] = [];
  const ext = path.extname(file.originalname).toLowerCase();

  if (ext === '.pdf') {
    products = await service.extractFromPDF(file.path);
  } else {
    // CSV/XLSX support via manual product input
    products = [];
  }

  const pl = await service.createPriceList({
    nombre: body.nombre,
    version: body.version,
    vigente: body.vigente === 'true',
    ivaPorcentaje: body.ivaPorcentaje ? parseFloat(body.ivaPorcentaje) : 21,
    products,
  });

  res.status(201).json(pl);
}

export async function createManual(req: Request, res: Response) {
  const body = z.object({
    nombre: z.string().min(1),
    version: z.string().optional(),
    vigente: z.boolean().optional(),
    ivaPorcentaje: z.number().optional(),
    products: z.array(z.object({
      codigo: z.string(),
      descripcion: z.string(),
      precioUnidad: z.number(),
      precioBulto: z.number().nullable().optional(),
    })),
  }).parse(req.body);

  const pl = await service.createPriceList(body as service.CreatePriceListInput);
  res.status(201).json(pl);
}

export async function activate(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  const pl = await service.activatePriceList(id);
  res.json(pl);
}

export async function deleteList(req: Request, res: Response) {
  const id = parseInt(req.params.id);
  await service.deletePriceList(id);
  res.json({ message: 'Lista eliminada' });
}

export async function editProduct(req: Request, res: Response) {
  const id = parseInt(req.params.productId);
  const data = z.object({
    descripcion: z.string().optional(),
    precioUnidad: z.number().optional(),
    precioBulto: z.number().nullable().optional(),
    ivaPorcentaje: z.number().optional(),
    activo: z.boolean().optional(),
  }).parse(req.body);
  const product = await service.updateProduct(id, data);
  res.json(product);
}

export async function previewPDF(req: Request, res: Response) {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'PDF requerido' });

  try {
    const products = await service.extractFromPDF(file.path);
    // Clean temp file
    fs.unlinkSync(file.path);

    // Logging
    console.log(`📊 PDF preview: ${file.originalname} → ${products.length} productos detectados`);
    if (products.length === 0) {
      console.warn('⚠️  No se detectaron productos. Verifica el formato del PDF.');
    }

    res.json({ products, count: products.length, file: file.originalname });
  } catch (err: any) {
    try {
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    } catch {}
    console.error('❌ Error extrayendo PDF:', err.message);
    throw Object.assign(new Error('Error al leer el PDF: ' + err.message), { status: 400 });
  }
}
