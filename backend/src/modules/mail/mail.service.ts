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

// ─── Formato canónico de línea de pedido ──────────────────────────────────────

const MODE_LINE_LABEL: Record<string, string> = {
  FC_A: 'FC A', MITAD: 'Mitad', Z: 'en Z', REMITO: 'Remito',
};

type OrderForLine = {
  tipoCalculo: string;
  clienteNombre: string | null;
  textoOriginal: string | null;
  observaciones: string | null;
  cliente: { nombre: string; codigo: string } | null;
  items: Array<{
    codigo: string;
    cantidad: number;
    cantidadBonificada: number;
    tipoLinea: string;
  }>;
};

/**
 * Construye la línea canónica de un pedido para el cuerpo del mail:
 *   <Cliente> - <Código>: <Modo> - <cod=cant> - <cod=cant> ... <Observación>
 *
 * Si hay textoOriginal, lo usa directamente (ya tiene el formato correcto).
 * En caso contrario, reconstruye desde los ítems guardados.
 */
function buildOrderLine(order: OrderForLine): string {
  // Usar textoOriginal si está disponible (ya incluye obs si el usuario las escribió)
  if (order.textoOriginal?.trim()) {
    const base = order.textoOriginal.trim();
    // Agregar observaciones si existen y no están ya en el texto original
    if (order.observaciones && !base.includes(order.observaciones)) {
      return `${base} ${order.observaciones}`;
    }
    return base;
  }

  // Fallback: reconstruir formato canónico desde ítems
  const clienteName = order.cliente?.nombre ?? order.clienteNombre ?? 'Sin cliente';
  const codigo = order.cliente?.codigo;
  const clientPart = codigo ? `${clienteName} - ${codigo}` : clienteName;

  const modeLabel = MODE_LINE_LABEL[order.tipoCalculo] ?? order.tipoCalculo;

  const itemsStr = buildItemsStr(order);
  const obs = order.observaciones ? ` ${order.observaciones}` : '';

  return `${clientPart}: ${modeLabel} - ${itemsStr}${obs}`;
}

/**
 * Construye la parte de ítems de la línea canónica.
 * Para MITAD agrupa FC_A + REMITO del mismo código sumando cantidades.
 */
function buildItemsStr(order: OrderForLine): string {
  if (order.tipoCalculo === 'MITAD') {
    const grouped = new Map<string, number>();
    for (const item of order.items) {
      grouped.set(item.codigo, (grouped.get(item.codigo) ?? 0) + item.cantidad);
    }
    return [...grouped.entries()]
      .map(([cod, qty]) => `${cod}=${qty}`)
      .join(' - ');
  }
  return order.items
    .map((i) => {
      const qty = (i.cantidadBonificada ?? 0) > 0
        ? `${i.cantidad}+${i.cantidadBonificada}`
        : `${i.cantidad}`;
      return `${i.codigo}=${qty}`;
    })
    .join(' - ');
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
      text: buildOrderLine(order as any),
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
  /** Máximo de pedidos por mail. Si undefined → todos en un solo mail. */
  maxOrdersPerMail?: number;
}

export interface SendBatchResult {
  success: boolean;
  enviados: number;
  omitidos: number;
  asunto: string;
  error?: string;
}

/**
 * Envía en lote todos los pedidos confirmados del día que aún no fueron enviados.
 * Con maxOrdersPerMail se pueden partir en varias entregas (1–5 mails).
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

  // Partir en chunks si se configura maxOrdersPerMail
  const chunkSize = input.maxOrdersPerMail && input.maxOrdersPerMail > 0
    ? input.maxOrdersPerMail
    : orders.length;
  const chunks: typeof orders[] = [];
  for (let i = 0; i < orders.length; i += chunkSize) {
    chunks.push(orders.slice(i, i + chunkSize));
  }

  try {
    let enviados = 0;

    for (let ci = 0; ci < chunks.length; ci++) {
      const chunk = chunks[ci];
      const chunkLabel = chunks.length > 1
        ? `Pedidos ${dateLabel} (${ci + 1}/${chunks.length})`
        : `Pedidos ${dateLabel} (${orders.length} pedido${orders.length !== 1 ? 's' : ''})`;

      const attachments = await Promise.all(
        chunk.map(async (order) => {
          const pdf = await generateOrderPDF(order as any);
          const cliente = order.cliente?.nombre ?? order.clienteNombre ?? `pedido-${order.id}`;
          const nro = order.nroPedidoDia ? `-${order.nroPedidoDia}` : '';
          return { filename: `${cliente}${nro}.pdf`, content: pdf, contentType: 'application/pdf' as const };
        })
      );

      const bodyText = buildBatchBody(chunk as any[], dateLabel);

      await getTransporter().sendMail({
        from: `"Chil Slices" <${config.mail.from}>`,
        to: input.destinatario,
        subject: chunkLabel,
        text: bodyText,
        attachments,
      });

      enviados += chunk.length;
    }

    // Marcar todos como enviados
    await prisma.order.updateMany({
      where: { id: { in: orders.map((o) => o.id) } },
      data: { estadoEnvio: 'enviado', fechaEnvio: new Date(), mailDestinatario: input.destinatario },
    });

    const asunto = chunks.length > 1
      ? `Pedidos ${dateLabel} (${chunks.length} mails)`
      : `Pedidos ${dateLabel} (${orders.length} pedido${orders.length !== 1 ? 's' : ''})`;

    return { success: true, enviados, omitidos: 0, asunto };
  } catch (err: any) {
    await prisma.order.updateMany({
      where: { id: { in: orders.map((o) => o.id) } },
      data: { estadoEnvio: 'error' },
    });
    return { success: false, enviados: 0, omitidos: orders.length, asunto: '', error: err.message };
  }
}

/**
 * Construye el cuerpo del mail batch: una línea por pedido en formato canónico.
 *
 * Ejemplo:
 *   Pedidos Jueves 09-04-2026
 *
 *   Rojo - 339: FC A - 506=10 - 524=1 Firma
 *   Azul - 601: en Z - 601=20 - 675=2 PAGA
 */
function buildBatchBody(orders: Array<OrderForLine & { nroPedidoDia: number | null }>, dateLabel: string): string {
  const lines = [
    `Pedidos ${dateLabel}`,
    '',
    ...orders.map((o) => buildOrderLine(o)),
  ];
  return lines.join('\n');
}
