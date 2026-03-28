import nodemailer from 'nodemailer';
import { Prisma } from '@prisma/client';
import { config } from '../../config';
import prisma from '../../prisma';
import { generateOrderPDF } from '../export/export.service';

// ─── Transporter (singleton lazy) ────────────────────────────────────────────

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.mail.host,
      port: config.mail.port,
      secure: config.mail.secure,
      auth: { user: config.mail.user, pass: config.mail.pass },
    });
  }
  return transporter;
}

// ─── Utilidades de formato ────────────────────────────────────────────────────

function buildDateLabel(date: Date): string {
  const tz = 'America/Argentina/Buenos_Aires';
  const formatter = new Intl.DateTimeFormat('es-AR', { timeZone: tz, weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
  const parts = formatter.formatToParts(date);
  const dia = parts.find((p) => p.type === 'day')?.value ?? '00';
  const mes = parts.find((p) => p.type === 'month')?.value ?? '00';
  const anio = parts.find((p) => p.type === 'year')?.value ?? '0000';
  const semana = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const semanaC = semana.charAt(0).toUpperCase() + semana.slice(1);
  return `${semanaC} ${dia}-${mes}-${anio}`;
}

function buildSubject(fecha: Date, nroPedidoDia: number): string {
  return `Pedido ${buildDateLabel(fecha)}-${nroPedidoDia}`;
}

// ─── Correlativo diario ───────────────────────────────────────────────────────

/**
 * Calcula el siguiente número de pedido del día para el vendedor.
 * Solo cuenta pedidos que ya fueron enviados o están confirmados del día.
 */
export async function getNextNroPedidoDia(vendedorId?: number): Promise<number> {
  const tz = 'America/Argentina/Buenos_Aires';
  const now = new Date();

  // Inicio del día en Argentina
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const [anio, mes, dia] = formatter.format(now).split('-').map(Number);
  const startOfDay = new Date(Date.UTC(anio, mes - 1, dia, 3, 0, 0)); // UTC+3 = hora arg

  const where: Prisma.OrderWhereInput = {
    fecha: { gte: startOfDay },
    nroPedidoDia: { not: null },
  };
  if (vendedorId) where.vendedorId = vendedorId;

  const count = await prisma.order.count({ where });
  return count + 1;
}

// ─── Envío de pedido individual ───────────────────────────────────────────────

export interface SendOrderInput {
  orderId: number;
  destinatario: string;
}

export interface SendOrderResult {
  success: boolean;
  messageId?: string;
  error?: string;
  asunto: string;
}

export async function sendOrderByMail(input: SendOrderInput): Promise<SendOrderResult> {
  if (!config.mail.user || !config.mail.pass) {
    return { success: false, error: 'Cuenta de mail no configurada (MAIL_USER/MAIL_PASS en .env)', asunto: '' };
  }

  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    include: {
      items: { include: { producto: true } },
      cliente: true,
      vendedor: { select: { id: true, name: true } },
      priceList: { select: { id: true, nombre: true, version: true } },
    },
  });

  if (!order) throw Object.assign(new Error('Pedido no encontrado'), { status: 404 });

  // Asignar correlativo si no tiene
  let nroPedidoDia = order.nroPedidoDia;
  if (!nroPedidoDia) {
    nroPedidoDia = await getNextNroPedidoDia(order.vendedorId ?? undefined);
    await prisma.order.update({
      where: { id: order.id },
      data: { nroPedidoDia },
    });
  }

  const asunto = buildSubject(order.fecha, nroPedidoDia);

  try {
    const pdfBuffer = await generateOrderPDF(order as any);

    await getTransporter().sendMail({
      from: `"Chil Slices" <${config.mail.from}>`,
      to: input.destinatario,
      subject: asunto,
      text: buildPlainTextBody(order as any),
      attachments: [
        {
          filename: `pedido-${order.id}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });

    await prisma.order.update({
      where: { id: order.id },
      data: {
        estadoEnvio: 'enviado',
        fechaEnvio: new Date(),
        mailDestinatario: input.destinatario,
      },
    });

    return { success: true, asunto };
  } catch (err: any) {
    await prisma.order.update({
      where: { id: order.id },
      data: { estadoEnvio: 'error' },
    });
    return { success: false, error: err.message, asunto };
  }
}

// ─── Envío batch del día ─────────────────────────────────────────────────────

export interface SendBatchInput {
  destinatario: string;
  vendedorId?: number;
}

export interface SendBatchResult {
  success: boolean;
  enviados: number;
  omitidos: number;
  asunto: string;
  error?: string;
}

/**
 * Envía en un único mail todos los pedidos confirmados del día que aún no fueron enviados.
 * Cada pedido se adjunta como PDF independiente.
 * Previene reenvío: solo procesa pedidos con estadoEnvio !== 'enviado'.
 */
export async function sendBatchByMail(input: SendBatchInput): Promise<SendBatchResult> {
  if (!config.mail.user || !config.mail.pass) {
    return { success: false, enviados: 0, omitidos: 0, asunto: '', error: 'Cuenta de mail no configurada (MAIL_USER/MAIL_PASS en .env)' };
  }

  const tz = 'America/Argentina/Buenos_Aires';
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  const [anio, mes, dia] = formatter.format(now).split('-').map(Number);
  const startOfDay = new Date(Date.UTC(anio, mes - 1, dia, 3, 0, 0));

  const where: Prisma.OrderWhereInput = {
    fecha: { gte: startOfDay },
    estado: 'confirmado',
    estadoEnvio: { not: 'enviado' },
  };
  if (input.vendedorId) where.vendedorId = input.vendedorId;

  const orders = await prisma.order.findMany({
    where,
    include: {
      items: { include: { producto: true } },
      cliente: true,
      vendedor: { select: { id: true, name: true } },
      priceList: { select: { id: true, nombre: true, version: true } },
    },
    orderBy: { nroPedidoDia: 'asc' },
  });

  if (orders.length === 0) {
    const dateLabel = buildDateLabel(now);
    return { success: true, enviados: 0, omitidos: 0, asunto: `Pedidos ${dateLabel} — sin pendientes` };
  }

  // Asignar correlativo a los que no tienen
  for (const order of orders) {
    if (!order.nroPedidoDia) {
      const nro = await getNextNroPedidoDia(order.vendedorId ?? undefined);
      await prisma.order.update({ where: { id: order.id }, data: { nroPedidoDia: nro } });
      order.nroPedidoDia = nro;
    }
  }

  const dateLabel = buildDateLabel(now);
  const asunto = `Pedidos ${dateLabel} (${orders.length} pedido${orders.length !== 1 ? 's' : ''})`;

  try {
    const attachments = await Promise.all(
      orders.map(async (order) => {
        const pdf = await generateOrderPDF(order as any);
        const cliente = order.cliente?.nombre ?? order.clienteNombre ?? `pedido-${order.id}`;
        const nro = order.nroPedidoDia ? `-${order.nroPedidoDia}` : '';
        return { filename: `${cliente}${nro}.pdf`, content: pdf, contentType: 'application/pdf' as const };
      })
    );

    const bodyText = buildBatchBody(orders as any[], dateLabel);

    await getTransporter().sendMail({
      from: `"Chil Slices" <${config.mail.from}>`,
      to: input.destinatario,
      subject: asunto,
      text: bodyText,
      attachments,
    });

    // Mark all as sent
    await prisma.order.updateMany({
      where: { id: { in: orders.map((o) => o.id) } },
      data: { estadoEnvio: 'enviado', fechaEnvio: new Date(), mailDestinatario: input.destinatario },
    });

    return { success: true, enviados: orders.length, omitidos: 0, asunto };
  } catch (err: any) {
    await prisma.order.updateMany({
      where: { id: { in: orders.map((o) => o.id) } },
      data: { estadoEnvio: 'error' },
    });
    return { success: false, enviados: 0, omitidos: orders.length, asunto, error: err.message };
  }
}

function buildBatchBody(orders: Array<{
  id: number;
  nroPedidoDia: number | null;
  clienteNombre: string | null;
  cliente: { nombre: string; codigo: string } | null;
  tipoCalculo: string;
  totalFinal: number;
}>, dateLabel: string): string {
  const modeLabel: Record<string, string> = {
    FC_A: 'FC A', MITAD: 'Mitad', Z: 'Z', REMITO: 'Remito',
  };
  const totalGeneral = orders.reduce((acc, o) => acc + o.totalFinal, 0);

  const lines = [
    `PEDIDOS DEL DÍA: ${dateLabel}`,
    `Total: ${orders.length} pedido${orders.length !== 1 ? 's' : ''}`,
    '',
    'RESUMEN:',
    ...orders.map((o) => {
      const nro = o.nroPedidoDia ? `[${o.nroPedidoDia}] ` : '';
      const cliente = o.cliente?.nombre ?? o.clienteNombre ?? 'Sin cliente';
      const tipo = modeLabel[o.tipoCalculo] ?? o.tipoCalculo;
      return `  ${nro}${cliente} | ${tipo} | $${o.totalFinal.toFixed(2)}`;
    }),
    '',
    `TOTAL DEL DÍA: $${totalGeneral.toFixed(2)}`,
    '',
    'Se adjuntan los PDFs de cada pedido.',
  ];

  return lines.join('\n');
}

// ─── Cuerpo del mail en texto plano ──────────────────────────────────────────

function buildPlainTextBody(order: {
  id: number;
  clienteNombre: string | null;
  cliente: { nombre: string; codigo: string } | null;
  tipoCalculo: string;
  totalFinal: number;
  items: Array<{ codigo: string; descripcion: string; cantidad: number; cantidadBonificada: number; precioAplicado: number; total: number; tipoLinea: string }>;
}): string {
  const cliente = order.cliente?.nombre ?? order.clienteNombre ?? 'Sin cliente';
  const modeLabel: Record<string, string> = {
    FC_A: 'Factura A', MITAD: 'Mitad FC-A / Remito', Z: 'Lista Z', REMITO: 'Remito',
  };

  const lines = [
    `PEDIDO Nro: ${order.id}`,
    `Cliente: ${cliente}`,
    `Tipo: ${modeLabel[order.tipoCalculo] ?? order.tipoCalculo}`,
    '',
    'DETALLE:',
    ...order.items.map((i) => {
      const bonus = i.cantidadBonificada > 0 ? `+${i.cantidadBonificada}` : '';
      return `  ${i.codigo} - ${i.descripcion}: ${i.cantidad}${bonus} x $${i.precioAplicado.toFixed(2)} = $${i.total.toFixed(2)} [${i.tipoLinea}]`;
    }),
    '',
    `TOTAL: $${order.totalFinal.toFixed(2)}`,
  ];

  return lines.join('\n');
}
