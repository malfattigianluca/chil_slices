import { Request, Response } from 'express';
import { z } from 'zod';
import * as service from './order.service';
import { AuthRequest } from '../../middleware/auth.middleware';
import { generateOrderPDF } from '../export/export.service';

const recalculateSchema = z.object({
  mode: z.string(),
  items: z.array(z.object({
    productoId: z.number().nullable().optional(),
    codigo: z.string(),
    descripcion: z.string(),
    cantidad: z.number(),
    cantidadBonificada: z.number().default(0),
    precioUnidad: z.number(),
    precioBulto: z.number().nullable().optional(),
    precioAplicado: z.number(),
    subtotal: z.number(),
    neto: z.number().nullable().optional(),
    iva: z.number().nullable().optional(),
    total: z.number(),
    tipoLinea: z.enum(['FC_A', 'REMITO', 'Z']),
    isMitad: z.boolean(),
    notFound: z.boolean(),
  })),
  clientId: z.number().optional(),
});

const previewSchema = z.object({
  text: z.string().min(1),
  clientId: z.number().optional(),
  priceListId: z.number().optional(),
});

const saveSchema = z.object({
  clientId: z.number().optional(),
  clienteNombre: z.string().optional(),
  tipoCalculo: z.string(),
  listaPrecioId: z.number().optional(),
  observaciones: z.string().optional(),
  textoOriginal: z.string().optional(),
  calculation: z.object({
    mode: z.string(),
    items: z.array(z.object({
      productoId: z.number().nullable().optional(),
      codigo: z.string(),
      descripcion: z.string(),
      cantidad: z.number(),
      precioUnidad: z.number(),
      precioBulto: z.number().nullable().optional(),
      precioAplicado: z.number(),
      subtotal: z.number(),
      neto: z.number().nullable().optional(),
      iva: z.number().nullable().optional(),
      total: z.number(),
      tipoLinea: z.string(),
      isMitad: z.boolean(),
      notFound: z.boolean(),
    })),
    subtotalNeto: z.number(),
    ivaTotal: z.number(),
    percepcionIva: z.number().optional(),
    percepcionIibb: z.number().optional(),
    aplicaPercepcionIva: z.boolean().optional(),
    alicuotaPercepcionIva: z.number().optional(),
    alicuotaPercepcionIibb: z.number().optional(),
    totalFinal: z.number(),
    groupFCA: z.array(z.any()).nullable().optional(),
    groupRemito: z.array(z.any()).nullable().optional(),
    subtotalFCA: z.number().nullable().optional(),
    subtotalRemito: z.number().nullable().optional(),
  }),
});

export async function recalculate(req: AuthRequest, res: Response) {
  const body = recalculateSchema.parse(req.body);
  const result = await service.recalculateOrder(body as any);
  res.json(result);
}

export async function preview(req: AuthRequest, res: Response) {
  const body = previewSchema.parse(req.body);
  const result = await service.previewOrder(body);
  res.json(result);
}

export async function save(req: AuthRequest, res: Response) {
  const body = saveSchema.parse(req.body);
  const order = await service.saveOrder({
    ...body,
    vendedorId: req.user!.id,
    calculation: body.calculation as any,
  });
  res.status(201).json(order);
}

export async function getAll(req: AuthRequest, res: Response) {
  const vendedorId = req.user!.role !== 'admin' ? req.user!.id : undefined;
  const params = {
    vendedorId,
    clienteId: req.query.clienteId ? parseInt(req.query.clienteId as string) : undefined,
    estado: req.query.estado as string | undefined,
    tipoCalculo: req.query.tipoCalculo as string | undefined,
    estadoEnvio: req.query.estadoEnvio as string | undefined,
    fechaDesde: req.query.fechaDesde as string | undefined,
    fechaHasta: req.query.fechaHasta as string | undefined,
    limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
    offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
  };
  res.json(await service.getAll(params));
}

export async function getById(req: Request, res: Response) {
  const order = await service.getById(parseInt(req.params.id));
  res.json(order);
}

export async function exportPDF(req: Request, res: Response) {
  const order = await service.getById(parseInt(req.params.id));
  const pdfBuffer = await generateOrderPDF(order as any);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="pedido-${order.id}.pdf"`);
  res.send(pdfBuffer);
}

export async function updateEstado(req: Request, res: Response) {
  const { estado } = z.object({ estado: z.string() }).parse(req.body);
  res.json(await service.updateEstado(parseInt(req.params.id), estado));
}

export async function deleteOrder(req: Request, res: Response) {
  await service.deleteOrder(parseInt(req.params.id));
  res.json({ message: 'Pedido eliminado' });
}

export async function metrics(req: AuthRequest, res: Response) {
  const vendedorId = req.user!.role !== 'admin' ? req.user!.id : undefined;
  res.json(await service.getMetrics(vendedorId));
}
