import prisma from '../../prisma';
import { Prisma } from '@prisma/client';
import { parseOrderText, CalcMode } from '../parser/parser.service';
import { calculateOrder, CalculationResult, CalculatedItem, CalculationContext, rebuildFromItems } from '../calculator/calculator.service';
import { getActivePriceMap } from '../price-lists/priceList.service';
import { fuzzyMatchClients } from '../../utils/fuzzy-client';
import { getNextNroPedidoDia } from '../mail/mail.service';

export type FiscalStatus = 'completo' | 'parcial' | 'sin_dato';

/**
 * Determina el estado fiscal de un cliente:
 *   completo  → tiene CUIT + condición fiscal + datos de percepción
 *   parcial   → tiene algunos datos pero faltan percepciones
 *   sin_dato  → sin información fiscal suficiente
 */
function getFiscalStatus(client: {
  cuit: string | null;
  condicionFiscal: string | null;
  aplicaPercepcionIva: boolean;
  alicuotaPercepcionIva: number;
  alicuotaPercepcionIibb: number | null;
}): FiscalStatus {
  const hasCuit = !!client.cuit;
  const hasCondicion = !!client.condicionFiscal;
  const hasPercepcion = client.alicuotaPercepcionIva > 0 || client.alicuotaPercepcionIibb !== null;

  if (hasCuit && hasCondicion && hasPercepcion) return 'completo';
  if (hasCuit || hasCondicion) return 'parcial';
  return 'sin_dato';
}

export interface PreviewOrderInput {
  text: string;
  clientId?: number;
  priceListId?: number;
}

/**
 * Parsea y calcula un pedido sin persistirlo (preview).
 */
export async function previewOrder(input: PreviewOrderInput) {
  const parsed = parseOrderText(input.text);

  // Resolver lista de precios
  let priceMap = await getActivePriceMap();

  // Si se especifica una lista particular, usarla
  if (input.priceListId) {
    const pl = await prisma.priceList.findUnique({
      where: { id: input.priceListId },
      include: { products: { where: { activo: true } } },
    });
    if (pl) {
      priceMap = new Map(pl.products.map((p) => [p.codigo, {
        id: p.id, codigo: p.codigo, descripcion: p.descripcion,
        precioUnidad: p.precioUnidad, precioBulto: p.precioBulto,
        ivaPorcentaje: p.ivaPorcentaje,
      }]));
    }
  }

  // Si hay clientId, resolver cliente
  let clientData = null;
  let clientFuzzyMatches: import('../../utils/fuzzy-client').FuzzyMatch[] = [];

  if (input.clientId) {
    clientData = await prisma.client.findUnique({ where: { id: input.clientId } });
  } else if (parsed.clientCode) {
    clientData = await prisma.client.findFirst({ where: { codigo: parsed.clientCode } });
  } else if (parsed.clientName) {
    // Fuzzy matching: reemplaza el substring contains de Prisma
    const allClients = await prisma.client.findMany({
      select: { id: true, codigo: true, nombre: true },
      where: { active: true },
    });
    clientFuzzyMatches = fuzzyMatchClients(parsed.clientName, allClients);

    if (clientFuzzyMatches.length > 0 && clientFuzzyMatches[0].confidence !== 'none') {
      const bestMatch = clientFuzzyMatches[0];
      // Si el match es exacto o de alta confianza, usar directamente
      if (bestMatch.confidence === 'exact' || bestMatch.confidence === 'high') {
        clientData = await prisma.client.findUnique({ where: { id: bestMatch.client.id } });
      }
      // Si la confianza es baja, devolvemos los candidatos para que el frontend los muestre
    }
  }

  const lookup = (code: string) => priceMap.get(code) ?? null;
  const calculation = calculateOrder(parsed.calcMode, parsed.items, lookup, {
    aplicaPercepcionIva: clientData?.aplicaPercepcionIva ?? false,
    alicuotaPercepcionIva: clientData?.alicuotaPercepcionIva ?? 0,
    alicuotaPercepcionIibb: clientData?.alicuotaPercepcionIibb ?? 0,
  });

  // Estado fiscal del cliente
  const fiscalStatus = clientData
    ? getFiscalStatus(clientData)
    : 'sin_dato';

  return {
    parsed,
    calculation,
    client: clientData,
    clientFuzzyMatches: clientFuzzyMatches.length > 1 || clientFuzzyMatches[0]?.confidence === 'low'
      ? clientFuzzyMatches
      : [],
    fiscalStatus,
  };
}

export interface SaveOrderInput {
  clientId?: number;
  clienteNombre?: string;
  vendedorId?: number;
  tipoCalculo: string;
  listaPrecioId?: number;
  observaciones?: string;
  textoOriginal?: string;
  calculation: CalculationResult;
}

/**
 * Persiste un pedido calculado en la base de datos.
 * Asigna automáticamente el correlativo del día (nroPedidoDia).
 */
export async function saveOrder(input: SaveOrderInput) {
  const { calculation } = input;

  const nroPedidoDia = await getNextNroPedidoDia(input.vendedorId);

  const order = await prisma.order.create({
    data: {
      clienteId: input.clientId,
      clienteNombre: input.clienteNombre,
      vendedorId: input.vendedorId,
      tipoCalculo: input.tipoCalculo,
      nroPedidoDia,
      subtotalNeto: calculation.subtotalNeto,
      ivaTotal: calculation.ivaTotal,
      percepcionIva: calculation.percepcionIva,
      percepcionIibb: calculation.percepcionIibb,
      totalFinal: calculation.totalFinal,
      listaPrecioId: input.listaPrecioId,
      observaciones: input.observaciones,
      textoOriginal: input.textoOriginal,
      estado: 'confirmado',
      items: {
        create: calculation.items.map((item) => ({
          productoId: item.productoId,
          codigo: item.codigo,
          descripcion: item.descripcion,
          cantidad: item.cantidad,
          cantidadBonificada: item.cantidadBonificada,
          tipoLinea: item.tipoLinea,
          precioAplicado: item.precioAplicado,
          subtotal: item.subtotal,
          neto: item.neto,
          iva: item.iva,
          total: item.total,
          isMitad: item.isMitad,
        })),
      },
    },
    include: { items: true, cliente: true, vendedor: { select: { id: true, name: true } } },
  });

  return order;
}

export async function getAll(params: {
  vendedorId?: number;
  clienteId?: number;
  estado?: string;
  tipoCalculo?: string;
  estadoEnvio?: string;
  fechaDesde?: string;
  fechaHasta?: string;
  limit?: number;
  offset?: number;
}) {
  const { vendedorId, clienteId, estado, tipoCalculo, estadoEnvio, fechaDesde, fechaHasta, limit = 50, offset = 0 } = params;

  const where: Prisma.OrderWhereInput = {};
  if (vendedorId) where.vendedorId = vendedorId;
  if (clienteId) where.clienteId = clienteId;
  if (estado) where.estado = estado;
  if (tipoCalculo) where.tipoCalculo = tipoCalculo;
  if (estadoEnvio) where.estadoEnvio = estadoEnvio;
  if (fechaDesde || fechaHasta) {
    where.fecha = {};
    if (fechaDesde) (where.fecha as Prisma.DateTimeFilter).gte = new Date(fechaDesde);
    if (fechaHasta) {
      const hasta = new Date(fechaHasta);
      hasta.setHours(23, 59, 59, 999);
      (where.fecha as Prisma.DateTimeFilter).lte = hasta;
    }
  }

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { fecha: 'desc' },
      take: limit,
      skip: offset,
      include: {
        cliente: { select: { id: true, nombre: true, codigo: true } },
        vendedor: { select: { id: true, name: true } },
        _count: { select: { items: true } },
      },
      // Note: estadoEnvio and nroPedidoDia are scalar fields included automatically
    }),
    prisma.order.count({ where }),
  ]);

  return { orders, total };
}

export async function getById(id: number) {
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: { include: { producto: true } },
      cliente: true,
      vendedor: { select: { id: true, name: true } },
      priceList: { select: { id: true, nombre: true, version: true } },
    },
  });
  if (!order) throw Object.assign(new Error('Pedido no encontrado'), { status: 404 });
  return order;
}

export async function updateEstado(id: number, estado: string) {
  return prisma.order.update({ where: { id }, data: { estado } });
}

export async function deleteOrder(id: number) {
  return prisma.order.delete({ where: { id } });
}

export interface RecalculateInput {
  mode: string;
  items: CalculatedItem[];
  clientId?: number;
}

/**
 * Recalcula los totales de un conjunto de ítems ya calculados (post-edición manual).
 * Resuelve las percepciones reales del cliente si se provee clientId.
 */
export async function recalculateOrder(input: RecalculateInput): Promise<CalculationResult> {
  const mode = input.mode as CalcMode;

  let context: CalculationContext = { aplicaPercepcionIva: false, alicuotaPercepcionIva: 0, alicuotaPercepcionIibb: 0 };
  if (input.clientId) {
    const client = await prisma.client.findUnique({ where: { id: input.clientId } });
    if (client) {
      context = {
        aplicaPercepcionIva: client.aplicaPercepcionIva,
        alicuotaPercepcionIva: client.alicuotaPercepcionIva,
        alicuotaPercepcionIibb: client.alicuotaPercepcionIibb ?? 0,
      };
    }
  }

  return rebuildFromItems(mode, input.items, context);
}

export async function getMetrics(vendedorId?: number) {
  const where = vendedorId ? { vendedorId } : {};

  const [total, confirmed, today] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.count({ where: { ...where, estado: 'confirmado' } }),
    prisma.order.count({
      where: {
        ...where,
        fecha: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
    }),
  ]);

  const sumResult = await prisma.order.aggregate({
    where: { ...where, estado: 'confirmado' },
    _sum: { totalFinal: true },
  });

  return {
    total,
    confirmed,
    today,
    totalVentas: sumResult._sum.totalFinal ?? 0,
  };
}

