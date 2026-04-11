/**
 * Parser de pedidos en texto libre.
 *
 * Formato esperado:
 *   [NombreCliente] - [CodigoCliente]: [ModoCalculo] - [cod=cant] - [cod=cant] ... [Observacion]
 *
 * Ejemplos:
 *   "Rojo - 339: mitad - 506=10 - 524=1 - 655=1"
 *   "Rojo - FC A - 506=10 - 524=1"
 *   "Cliente Z - 601=20 - 675=2"
 *   "Rojo - 339: FC A - 506=10 - 524=1 Firma"
 *   "Azul - 601: en Z - 601=20 PAGA"
 */

export type CalcMode = 'FC_A' | 'MITAD' | 'Z' | 'REMITO';

export interface ParsedItem {
  code: string;
  quantity: number;
  isMitad: boolean; // "mitad" aplicado a este producto individual
  cantidadBonificada: number; // unidades/bultos sin cargo (sintaxis cod=cant+bonus)
}

export interface ParsedOrder {
  clientName: string | null;
  clientCode: string | null;
  calcMode: CalcMode;
  items: ParsedItem[];
  observaciones: string | null; // texto libre al final de la línea (Firma, PAGA, etc.)
  rawText: string;
  warnings: string[];
}

// Normaliza texto: espacios múltiples, caracteres raros
function normalize(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

import { levenshteinDistance, normalizeForFuzzy } from '../../utils/levenshtein';

/**
 * Diccionario de aliases exactos para modos de cálculo.
 * Las claves están en minúsculas sin espacios ni acentos.
 */
const MODE_ALIASES: Record<string, CalcMode> = {
  'fca': 'FC_A', 'facturaa': 'FC_A', 'fa': 'FC_A', 'fca21': 'FC_A',
  'facturaa21': 'FC_A', 'iva': 'FC_A',
  'mitad': 'MITAD', 'half': 'MITAD', 'mit': 'MITAD',
  'z': 'Z', 'listaz': 'Z', 'lista': 'Z', 'listaprecios': 'Z', 'enz': 'Z', 'enz.': 'Z',
  'remito': 'REMITO', 'rem': 'REMITO', 'r': 'REMITO',
};

/** Umbral máximo de distancia de edición para considerar un match */
const MODE_FUZZY_THRESHOLD = 2;

/**
 * Detecta si un token es un modo de cálculo.
 * Primero busca en el diccionario de aliases exactos.
 * Si no encuentra, aplica Levenshtein sobre las claves del diccionario
 * con un umbral de distancia ≤ 2.
 */
function detectCalcMode(token: string): CalcMode | null {
  const normalized = normalizeForFuzzy(token).replace(/\s+/g, '');

  // Búsqueda exacta en aliases
  if (MODE_ALIASES[normalized]) return MODE_ALIASES[normalized];

  // Caso especial: "fc a" con espacio normaliza a "fca"
  const noSpaces = token.toLowerCase().replace(/\s+/g, '');
  if (MODE_ALIASES[noSpaces]) return MODE_ALIASES[noSpaces];

  // Fuzzy: solo aplicar si el token tiene entre 2 y 12 caracteres
  // para evitar falsos positivos en nombres de cliente o códigos de producto
  if (normalized.length < 2 || normalized.length > 12) return null;

  let bestMode: CalcMode | null = null;
  let bestDistance = MODE_FUZZY_THRESHOLD + 1;

  for (const [alias, mode] of Object.entries(MODE_ALIASES)) {
    // Solo comparar aliases de longitud similar (±3 caracteres)
    if (Math.abs(alias.length - normalized.length) > 3) continue;
    const dist = levenshteinDistance(normalized, alias);
    if (dist < bestDistance) {
      bestDistance = dist;
      bestMode = mode;
    }
  }

  return bestDistance <= MODE_FUZZY_THRESHOLD ? bestMode : null;
}

// Parsea un precio argentino: "1.234,56" o "1234.56" o "1234,56"
export function parseArgPrice(s: string): number {
  const cleaned = s.replace(/[^\d.,]/g, '');
  if (!cleaned) return NaN;
  // Si tiene coma: puede ser decimal argentino "1234,56" o "1.234,56"
  if (cleaned.includes(',')) {
    return parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
  }
  return parseFloat(cleaned);
}

/**
 * Parsea el texto del pedido y retorna una estructura normalizada.
 */
export function parseOrderText(text: string): ParsedOrder {
  const result: ParsedOrder = {
    clientName: null,
    clientCode: null,
    calcMode: 'Z', // default
    items: [],
    observaciones: null,
    rawText: text,
    warnings: [],
  };

  const normalized = normalize(text);
  if (!normalized) return result;

  let clientSection = '';
  let orderSection = normalized;

  // Separar sección cliente (antes de ':') de sección pedido (después de ':')
  const colonIdx = normalized.indexOf(':');
  if (colonIdx > -1) {
    clientSection = normalized.substring(0, colonIdx).trim();
    orderSection = normalized.substring(colonIdx + 1).trim();

    // Parsear sección cliente: "Rojo - 339" o "Rojo" o "Empresa SA - C123"
    const clientParts = clientSection
      .split('-')
      .map((p) => p.trim())
      .filter(Boolean);

    if (clientParts.length > 0) {
      const last = clientParts[clientParts.length - 1];
      // El código de cliente suele ser numérico o alfanumérico corto sin espacios
      if (/^\d+$/.test(last) || /^[A-Z0-9]{1,10}$/i.test(last)) {
        result.clientCode = last;
        result.clientName = clientParts.slice(0, -1).join(' - ').trim() || null;
      } else {
        result.clientName = clientParts.join(' - ').trim();
      }
    }
  }

  // Tokenizar la sección de pedido por ' - '
  const tokens = orderSection
    .split(/\s*-\s*/)
    .map((t) => t.trim())
    .filter(Boolean);

  let clientNameFromTokens: string | null = null;
  let foundMode = false;
  let foundFirstItem = false; // track when first product is found
  const obsTokens: string[] = []; // collect observation tokens after first item

  for (const token of tokens) {
    // Intentar detectar modo de cálculo
    const mode = detectCalcMode(token);
    if (mode) {
      result.calcMode = mode;
      foundMode = true;
      continue;
    }

    // Patrón producto con cantidad: "506=10" o "506 = 10" o "506: 10"
    // Captura bonificación opcional: "605=10+1"
    // Captura texto de observación inline opcional: "506=10 Firma"
    const eqMatch = token.match(/^(\d{2,8})\s*[=:]\s*(\d+(?:[.,]\d+)?)(?:\+(\d+(?:[.,]\d+)?))?\s*(.*)$/);
    if (eqMatch) {
      result.items.push({
        code: eqMatch[1],
        quantity: parseFloat(eqMatch[2].replace(',', '.')),
        isMitad: false,
        cantidadBonificada: eqMatch[3] ? parseFloat(eqMatch[3].replace(',', '.')) : 0,
      });
      foundFirstItem = true;
      // Capture trailing observation text in the same token (e.g., "506=10 Firma")
      const inlineObs = eqMatch[4]?.trim();
      if (inlineObs) {
        obsTokens.push(inlineObs);
      }
      continue;
    }

    // Patrón "339: mitad" o "339=mitad" (producto con mitad individual)
    const mitadMatch = token.match(/^(\d{2,8})\s*[=:]\s*mitad$/i);
    if (mitadMatch) {
      result.items.push({
        code: mitadMatch[1],
        quantity: 1,
        isMitad: true,
        cantidadBonificada: 0,
      });
      foundFirstItem = true;
      continue;
    }

    // Patrón solo código de producto sin cantidad (cantidad = 1 implícita)
    const onlyCode = token.match(/^(\d{3,8})$/);
    if (onlyCode) {
      result.items.push({ code: onlyCode[1], quantity: 1, isMitad: false, cantidadBonificada: 0 });
      foundFirstItem = true;
      continue;
    }

    // Si ya encontramos al menos un producto, el resto es observación
    if (foundFirstItem) {
      obsTokens.push(token);
      continue;
    }

    // Si no hubo sección cliente (no había ':'), el primer token de texto podría ser el cliente
    if (colonIdx === -1 && !clientNameFromTokens && !/^\d/.test(token) && !foundMode) {
      clientNameFromTokens = token;
      result.clientName = token;
      continue;
    }

    result.warnings.push(`Token no reconocido: "${token}"`);
  }

  // Si el modo se detectó desde los tokens y no había ':',
  // se puede haber usado el cliente desde tokens
  if (!result.clientName && clientNameFromTokens) {
    result.clientName = clientNameFromTokens;
  }

  if (obsTokens.length > 0) {
    result.observaciones = obsTokens.join(' ');
  }

  return result;
}

/**
 * Parsea múltiples pedidos separados por línea o punto y coma.
 */
export function parseMultipleOrders(text: string): ParsedOrder[] {
  return text
    .split(/\n|;/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => parseOrderText(line));
}
