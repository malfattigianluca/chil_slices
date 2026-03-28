/**
 * Motor de cálculo comercial.
 *
 * Modos soportados:
 *   FC_A  — Factura A: deduce IVA desde precio de lista (que ya incluye IVA)
 *   MITAD — Mitad FC_A + Mitad Remito (impares van a Remito)
 *   Z     — Lista Z: precio de lista directo, sin discriminar IVA
 *   REMITO— Remito: precio de lista directo, sin discriminar IVA
 */

import { CalcMode, ParsedItem } from '../parser/parser.service';

export interface ProductLookup {
  id: number;
  codigo: string;
  descripcion: string;
  precioUnidad: number;
  precioBulto: number | null;
  ivaPorcentaje: number;
}

export interface CalculatedItem {
  productoId: number | null;
  codigo: string;
  descripcion: string;
  cantidad: number;
  cantidadBonificada: number; // unidades/bultos sin cargo
  precioUnidad: number;
  precioBulto: number | null;
  precioAplicado: number;   // precio por unidad/bulto efectivamente usado
  subtotal: number;         // cantidad * precioAplicado (con IVA)
  neto: number | null;      // subtotal neto (sin IVA), solo FC_A
  iva: number | null;       // monto IVA, solo FC_A
  total: number;            // total final de la línea
  tipoLinea: 'FC_A' | 'REMITO' | 'Z';
  isMitad: boolean;
  notFound: boolean;        // true si no se encontró en la lista
}

export interface CalculationResult {
  mode: CalcMode;
  items: CalculatedItem[];
  // Totales generales
  subtotalNeto: number;
  ivaTotal: number;
  percepcionIva: number;
  percepcionIibb: number;
  aplicaPercepcionIva: boolean;
  alicuotaPercepcionIva: number;
  alicuotaPercepcionIibb: number;
  totalFinal: number;
  // Solo para MITAD: grupos separados
  groupFCA: CalculatedItem[] | null;
  groupRemito: CalculatedItem[] | null;
  subtotalFCA: number | null;
  subtotalRemito: number | null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface CalculationContext {
  aplicaPercepcionIva: boolean;
  alicuotaPercepcionIva: number;
  alicuotaPercepcionIibb: number;
}

function normalizeContext(context?: Partial<CalculationContext>): CalculationContext {
  return {
    aplicaPercepcionIva: context?.aplicaPercepcionIva ?? false,
    alicuotaPercepcionIva: context?.alicuotaPercepcionIva ?? 0,
    alicuotaPercepcionIibb: context?.alicuotaPercepcionIibb ?? 0,
  };
}

/**
 * Selecciona el precio a aplicar por línea.
 * Prioriza precioBulto sobre precioUnidad.
 * El flag isMitad es metadata del ítem individual (no afecta el precio unitario;
 * la lógica MITAD se aplica a nivel de cantidad en calculateMitad).
 */
function selectPrice(product: ProductLookup): number {
  return product.precioBulto ?? product.precioUnidad;
}

/**
 * Calcula una línea en modo FC_A.
 * El precio ya incluye IVA → neto = precio / (1 + iva/100).
 * item.quantity es la cantidad COBRADA; item.cantidadBonificada son las unidades sin cargo.
 * El subtotal solo cobra las unidades pagadas.
 */
function calcLineFC_A(
  product: ProductLookup,
  item: ParsedItem
): Omit<CalculatedItem, 'tipoLinea'> {
  const precioAplicado = selectPrice(product);
  const subtotal = round2(item.quantity * precioAplicado);
  const ivaRate = product.ivaPorcentaje / 100;
  const neto = round2(subtotal / (1 + ivaRate));
  const iva = round2(subtotal - neto);
  return {
    productoId: product.id,
    codigo: product.codigo,
    descripcion: product.descripcion,
    cantidad: item.quantity,
    cantidadBonificada: item.cantidadBonificada,
    precioUnidad: product.precioUnidad,
    precioBulto: product.precioBulto,
    precioAplicado,
    subtotal,
    neto,
    iva,
    total: subtotal, // total = subtotal (IVA ya incluido en precio de lista)
    isMitad: item.isMitad,
    notFound: false,
  };
}

/**
 * Calcula una línea en modo REMITO / Z.
 * Sin discriminar IVA. Precio de lista como está.
 */
function calcLineRemito(
  product: ProductLookup,
  item: ParsedItem,
  type: 'REMITO' | 'Z'
): Omit<CalculatedItem, 'tipoLinea'> {
  const precioAplicado = selectPrice(product);
  const subtotal = round2(item.quantity * precioAplicado);
  return {
    productoId: product.id,
    codigo: product.codigo,
    descripcion: product.descripcion,
    cantidad: item.quantity,
    cantidadBonificada: item.cantidadBonificada,
    precioUnidad: product.precioUnidad,
    precioBulto: product.precioBulto,
    precioAplicado,
    subtotal,
    neto: null,
    iva: null,
    total: subtotal,
    isMitad: item.isMitad,
    notFound: false,
  };
}

/**
 * Línea placeholder para producto no encontrado.
 */
function notFoundLine(item: ParsedItem): CalculatedItem {
  return {
    productoId: null,
    codigo: item.code,
    descripcion: `[No encontrado: ${item.code}]`,
    cantidad: item.quantity,
    cantidadBonificada: item.cantidadBonificada,
    precioUnidad: 0,
    precioBulto: null,
    precioAplicado: 0,
    subtotal: 0,
    neto: null,
    iva: null,
    total: 0,
    tipoLinea: 'Z',
    isMitad: item.isMitad,
    notFound: true,
  };
}

/**
 * Función principal del motor de cálculo.
 *
 * @param mode    Modo de cálculo
 * @param items   Líneas parseadas del pedido
 * @param lookup  Función que busca un producto por código en la lista vigente
 */
export function calculateOrder(
  mode: CalcMode,
  items: ParsedItem[],
  lookup: (code: string) => ProductLookup | null,
  context?: Partial<CalculationContext>,
): CalculationResult {
  const normalizedContext = normalizeContext(context);
  const calcItems: CalculatedItem[] = [];

  if (mode === 'FC_A') {
    for (const item of items) {
      const product = lookup(item.code);
      if (!product) { calcItems.push(notFoundLine(item)); continue; }
      calcItems.push({ ...calcLineFC_A(product, item), tipoLinea: 'FC_A' });
    }
    return buildTotals(mode, calcItems, null, null, normalizedContext);
  }

  if (mode === 'Z' || mode === 'REMITO') {
    const lineType = mode === 'Z' ? 'Z' : 'REMITO';
    for (const item of items) {
      const product = lookup(item.code);
      if (!product) { calcItems.push(notFoundLine(item)); continue; }
      calcItems.push({ ...calcLineRemito(product, item, lineType), tipoLinea: lineType });
    }
    return buildTotals(mode, calcItems, null, null, normalizedContext);
  }

  if (mode === 'MITAD') {
    return calculateMitad(items, lookup, normalizedContext);
  }

  return buildTotals(mode, calcItems, null, null, normalizedContext);
}

/**
 * Cálculo especial para MITAD.
 *
 * Por cada producto:
 *   cantidadFCA    = floor(cantidad / 2)
 *   cantidadRemito = ceil(cantidad / 2)
 *
 * Si cantidadFCA === 0, ese producto no genera línea en groupFCA.
 * Las percepciones se calculan únicamente sobre la parte FC_A.
 */
function calculateMitad(
  items: ParsedItem[],
  lookup: (code: string) => ProductLookup | null,
  context: CalculationContext,
): CalculationResult {
  const groupFCA: CalculatedItem[] = [];
  const groupRemito: CalculatedItem[] = [];

  for (const item of items) {
    const product = lookup(item.code);
    const cantFCA = Math.floor(item.quantity / 2);
    const cantRemito = Math.ceil(item.quantity / 2);

    if (cantFCA > 0) {
      const itemFCA: ParsedItem = { ...item, quantity: cantFCA };
      if (!product) {
        groupFCA.push(notFoundLine(itemFCA));
      } else {
        groupFCA.push({ ...calcLineFC_A(product, itemFCA), tipoLinea: 'FC_A' as const });
      }
    }

    if (cantRemito > 0) {
      const itemRemito: ParsedItem = { ...item, quantity: cantRemito };
      if (!product) {
        groupRemito.push(notFoundLine(itemRemito));
      } else {
        groupRemito.push({ ...calcLineRemito(product, itemRemito, 'REMITO'), tipoLinea: 'REMITO' as const });
      }
    }
  }

  const allItems = [...groupFCA, ...groupRemito];

  const subtotalFCA = round2(groupFCA.reduce((acc, i) => acc + i.total, 0));
  const subtotalRemito = round2(groupRemito.reduce((acc, i) => acc + i.total, 0));

  // Neto e IVA se calculan solo sobre la parte FC_A
  const subtotalNeto = round2(groupFCA.reduce((acc, i) => acc + (i.neto ?? 0), 0));
  const ivaTotal = round2(groupFCA.reduce((acc, i) => acc + (i.iva ?? 0), 0));

  // Percepciones: aproximación sobre el neto total del pedido
  // (FC_A parte exacta + Remito parte estimada a 21% de IVA)
  // Esto cubre el caso donde items con cantidad=1 van todos a Remito y el neto FC_A es 0
  const netoRemitoEstimado = round2(groupRemito.reduce((acc, i) => acc + round2(i.total / 1.21), 0));
  const netoParaPercepcion = round2(subtotalNeto + netoRemitoEstimado);
  const percepcionIva = context.aplicaPercepcionIva
    ? round2(netoParaPercepcion * (context.alicuotaPercepcionIva / 100))
    : 0;
  const percepcionIibb = context.alicuotaPercepcionIibb > 0
    ? round2(netoParaPercepcion * (context.alicuotaPercepcionIibb / 100))
    : 0;

  const totalFinal = round2(subtotalFCA + subtotalRemito + percepcionIva + percepcionIibb);

  return {
    mode: 'MITAD',
    items: allItems,
    subtotalNeto,
    ivaTotal,
    percepcionIva,
    percepcionIibb,
    aplicaPercepcionIva: context.aplicaPercepcionIva,
    alicuotaPercepcionIva: context.alicuotaPercepcionIva,
    alicuotaPercepcionIibb: context.alicuotaPercepcionIibb,
    totalFinal,
    groupFCA,
    groupRemito,
    subtotalFCA,
    subtotalRemito,
  };
}

/**
 * Recalcula los totales agregados a partir de un array de CalculatedItem ya calculados.
 * Útil para recalcular después de ediciones manuales en el frontend.
 */
export function rebuildFromItems(
  mode: CalcMode,
  items: CalculatedItem[],
  context: CalculationContext,
): CalculationResult {
  if (mode === 'MITAD') {
    const groupFCA = items.filter((i) => i.tipoLinea === 'FC_A');
    const groupRemito = items.filter((i) => i.tipoLinea !== 'FC_A');
    const subtotalFCA = round2(groupFCA.reduce((acc, i) => acc + i.total, 0));
    const subtotalRemito = round2(groupRemito.reduce((acc, i) => acc + i.total, 0));
    const subtotalNeto = round2(groupFCA.reduce((acc, i) => acc + (i.neto ?? 0), 0));
    const ivaTotal = round2(groupFCA.reduce((acc, i) => acc + (i.iva ?? 0), 0));
    const netoRemitoEstimado = round2(groupRemito.reduce((acc, i) => acc + round2(i.total / 1.21), 0));
    const netoParaPercepcion = round2(subtotalNeto + netoRemitoEstimado);
    const percepcionIva = context.aplicaPercepcionIva
      ? round2(netoParaPercepcion * (context.alicuotaPercepcionIva / 100))
      : 0;
    const percepcionIibb = context.alicuotaPercepcionIibb > 0
      ? round2(netoParaPercepcion * (context.alicuotaPercepcionIibb / 100))
      : 0;
    const totalFinal = round2(subtotalFCA + subtotalRemito + percepcionIva + percepcionIibb);
    return {
      mode, items, subtotalNeto, ivaTotal, percepcionIva, percepcionIibb,
      aplicaPercepcionIva: context.aplicaPercepcionIva,
      alicuotaPercepcionIva: context.alicuotaPercepcionIva,
      alicuotaPercepcionIibb: context.alicuotaPercepcionIibb,
      totalFinal, groupFCA, groupRemito, subtotalFCA, subtotalRemito,
    };
  }
  return buildTotals(mode, items, null, null, context);
}

function buildTotals(
  mode: CalcMode,
  items: CalculatedItem[],
  groupFCA: CalculatedItem[] | null,
  groupRemito: CalculatedItem[] | null,
  context: CalculationContext,
): CalculationResult {
  const subtotalNeto = round2(items.reduce((acc, i) => acc + (i.neto ?? 0), 0));
  const ivaTotal = round2(items.reduce((acc, i) => acc + (i.iva ?? 0), 0));
  const percepcionIva = context.aplicaPercepcionIva
    ? round2(subtotalNeto * (context.alicuotaPercepcionIva / 100))
    : 0;
  const percepcionIibb = context.alicuotaPercepcionIibb > 0
    ? round2(subtotalNeto * (context.alicuotaPercepcionIibb / 100))
    : 0;
  const totalFinal = round2(items.reduce((acc, i) => acc + i.total, 0) + percepcionIva + percepcionIibb);

  return {
    mode,
    items,
    subtotalNeto,
    ivaTotal,
    percepcionIva,
    percepcionIibb,
    aplicaPercepcionIva: context.aplicaPercepcionIva,
    alicuotaPercepcionIva: context.alicuotaPercepcionIva,
    alicuotaPercepcionIibb: context.alicuotaPercepcionIibb,
    totalFinal,
    groupFCA,
    groupRemito,
    subtotalFCA: null,
    subtotalRemito: null,
  };
}
