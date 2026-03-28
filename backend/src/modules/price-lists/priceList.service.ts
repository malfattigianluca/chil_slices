/**
 * Servicio de listas de precios.
 * Incluye extracción heurística de tablas desde texto de PDF.
 */

import fs from 'fs';
import pdfParse from 'pdf-parse';
import prisma from '../../prisma';
import { logger } from '../../utils/logger';

export interface ExtractedProduct {
  codigo: string;
  descripcion: string;
  precioUnidad: number;
  precioBulto: number | null;
}

interface PriceMatch {
  value: number;
  index: number;
}

// ─────────────────────────────────────────────
//  Extracción de PDF
// ─────────────────────────────────────────────

/**
 * Parsea un número en formato argentino o estándar.
 * "1.234,56" → 1234.56 | "1234.56" → 1234.56 | "1234,56" → 1234.56
 * Ahora más flexible con espacios y diferentes separadores.
 */
function parsePrice(s: string): number {
  if (!s) return NaN;

  // Limpiar espacios en blanco
  s = s.trim();

  // Remover $ o símbolos de moneda
  s = s.replace(/[$€\s]/g, '');

  // Caso 1: "1.234,56" o "1,234.56" (punto y coma/coma)
  // Si tiene coma, detectar si es separador decimal o miles
  if (s.includes(',') && s.includes('.')) {
    // Caso "1.234,56" → coma es decimal
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      // Caso "1,234.56" → coma es miles (inglés)
      s = s.replace(/,/g, '');
    }
  } else if (s.includes(',')) {
    const parts = s.split(',');
    const decimal = parts[parts.length - 1];
    const thousandStyle = parts.length > 1 && parts.slice(1).every((p) => p.length === 3);

    if (decimal.length === 2) {
      // "1234,56" → coma decimal
      s = `${parts.slice(0, -1).join('')}.${decimal}`;
    } else if (thousandStyle) {
      // "1,234" o "12,345,678" → coma miles
      s = parts.join('');
    } else {
      // Fallback latino: tratar coma como decimal
      s = s.replace(',', '.');
    }
  } else if (s.includes('.')) {
    const parts = s.split('.');
    const decimal = parts[parts.length - 1];
    const thousandStyle = parts.length > 1 && parts.slice(1).every((p) => p.length === 3);

    if (decimal.length === 2) {
      // "1234.56" → punto decimal
      s = `${parts.slice(0, -1).join('')}.${decimal}`;
    } else if (thousandStyle) {
      // "1.234" o "12.345.678" → punto miles
      s = parts.join('');
    }
  }

  const n = parseFloat(s);
  return isNaN(n) ? NaN : n;
}

function uniquePriceMatches(matches: PriceMatch[]): PriceMatch[] {
  const unique = new Map<string, PriceMatch>();

  for (const match of matches) {
    const key = `${match.index}:${match.value.toFixed(4)}`;
    if (!unique.has(key)) unique.set(key, match);
  }

  return Array.from(unique.values()).sort((a, b) => a.index - b.index);
}

function extractPriceMatches(line: string): PriceMatch[] {
  const matches: PriceMatch[] = [];

  // 1) Formatos con moneda explícita: "$123", "$ 123,45", "123,45$"
  const currencyPatterns = [
    /(?:\$|ARS|U\$S)\s*([\d][\d.,]*)/gi,
    /([\d][\d.,]*)\s*(?:\$|ARS|U\$S)/gi,
  ];

  for (const pattern of currencyPatterns) {
    for (const match of line.matchAll(pattern)) {
      const raw = match[1];
      if (!raw) continue;

      const value = parsePrice(raw);
      if (isNaN(value) || value < 1 || value >= 999999) continue;

      const baseIndex = typeof match.index === 'number' ? match.index : -1;
      const tokenOffset = match[0].indexOf(raw);

      matches.push({
        value,
        index: baseIndex + Math.max(tokenOffset, 0),
      });
    }
  }

  if (matches.length > 0) {
    return uniquePriceMatches(matches);
  }

  // 2) Fallback sin moneda: solo números con decimales (evita capturar códigos)
  for (const match of line.matchAll(/\b(\d{1,3}(?:[.\s]\d{3})*(?:[.,]\d{2})|\d+[.,]\d{2})\b/g)) {
    const raw = match[1];
    if (!raw) continue;

    const value = parsePrice(raw);
    if (isNaN(value) || value < 1 || value >= 999999) continue;

    matches.push({
      value,
      index: typeof match.index === 'number' ? match.index : -1,
    });
  }

  return uniquePriceMatches(matches);
}

export function extractAllPricesFromText(rawText: string): number[] {
  const prices: number[] = [];
  const lines = rawText.split('\n');

  for (const line of lines) {
    const lineMatches = extractPriceMatches(line);
    for (const match of lineMatches) prices.push(match.value);
  }

  return prices;
}

/**
 * Extrae los productos de un bloque de texto proveniente de pdf-parse.
 * El PDF tiene estructura peculiar: código en una línea, descripción+precios en la siguiente
 */
export function extractProductsFromText(rawText: string): ExtractedProduct[] {
  const products: ExtractedProduct[] = [];
  const lines = rawText.split('\n').map((line) => line.trim());
  const isCodeLine = (line: string) => /^\d{2,8}$/.test(line);
  const isMetaLine = (line: string) =>
    /^PAG\.:/i.test(line)
    || /^REG-/i.test(line)
    || /^LISTA DE PRECIOS/i.test(line)
    || /^MAYORISTA/i.test(line)
    || /^ACTUALIZADA/i.test(line)
    || /^CODIGO/i.test(line)
    || /^LINEA\b/i.test(line);

  const cleanDescriptionLine = (line: string): string => {
    if (!line || isMetaLine(line) || /^-\$$/.test(line)) return '';

    return line
      .replace(/(?:\$|ARS|U\$S)\s*[\d][\d.,]*/gi, ' ')
      .replace(/[\d][\d.,]*\s*(?:\$|ARS|U\$S)/gi, ' ')
      .replace(/\b\d{1,3}(?:[.\s]\d{3})*(?:[.,]\d{2})\b/g, ' ')
      .replace(/\b\d+[.,]\d{2}\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  // Recorremos productos por bloques:
  // [código] + [1..N líneas de descripción/precio] hasta próximo código.
  for (let i = 0; i < lines.length; i++) {
    const currentLine = lines[i];
    if (!isCodeLine(currentLine)) continue;

    const codigo = currentLine;
    const block: string[] = [];

    let j = i + 1;
    while (j < lines.length && !isCodeLine(lines[j]) && block.length < 8) {
      if (lines[j]) block.push(lines[j]);
      j++;
    }

    if (block.length === 0) continue;

    const precios: number[] = [];
    for (const line of block) {
      const matches = extractPriceMatches(line);
      for (const match of matches) precios.push(match.value);
    }

    if (precios.length === 0) continue;

    const descriptionCandidates: string[] = [];
    for (const line of block) {
      const cleaned = cleanDescriptionLine(line);
      if (!cleaned || cleaned.length < 3 || /^[\W\d]+$/.test(cleaned)) continue;
      descriptionCandidates.push(cleaned);
    }

    const descripcion = descriptionCandidates[0] ?? '';
    if (!descripcion) continue;

    const precioUnidad = precios.length >= 2 ? precios[precios.length - 2] : precios[0];
    const precioBulto = precios.length >= 2 ? precios[precios.length - 1] : null;

    products.push({
      codigo,
      descripcion,
      precioUnidad,
      precioBulto,
    });
  }

  return products;
}

/**
 * Lee un PDF desde disco y extrae los productos.
 */
export async function extractFromPDF(filePath: string): Promise<ExtractedProduct[]> {
  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);

  logger.info(`PDF leído: ${data.numpages} páginas, ${data.text.length} caracteres`);

  const firstLines = data.text.split('\n').slice(0, 30);
  logger.debug('Primeras 30 líneas del PDF:\n' + firstLines.map((l, i) => `${String(i).padStart(2, '0')}: ${l.substring(0, 100)}`).join('\n'));

  const allPrices = extractAllPricesFromText(data.text);
  logger.debug(`Precios detectados en todo el PDF: ${allPrices.length}`);

  const products = extractProductsFromText(data.text);

  logger.info(`Extracción: ${products.length} productos detectados`);

  if (products.length > 0) {
    logger.debug('Primeros productos:\n' + products.slice(0, 3).map((p) =>
      `  - ${p.codigo}: ${p.descripcion} → $${p.precioUnidad}${p.precioBulto ? ` / $${p.precioBulto}` : ''}`
    ).join('\n'));
  }

  return products;
}

// ─────────────────────────────────────────────
//  CRUD de listas de precios
// ─────────────────────────────────────────────

export async function getAllPriceLists() {
  return prisma.priceList.findMany({
    orderBy: { fechaCarga: 'desc' },
    include: { _count: { select: { products: true } } },
  });
}

export async function getPriceListById(id: number) {
  const pl = await prisma.priceList.findUnique({
    where: { id },
    include: { products: { where: { activo: true }, orderBy: { codigo: 'asc' } } },
  });
  if (!pl) throw Object.assign(new Error('Lista de precios no encontrada'), { status: 404 });
  return pl;
}

export async function getActivePriceList() {
  return prisma.priceList.findFirst({
    where: { vigente: true },
    include: { products: { where: { activo: true }, orderBy: { codigo: 'asc' } } },
  });
}

export interface CreatePriceListInput {
  nombre: string;
  version?: string;
  products: ExtractedProduct[];
  vigente?: boolean;
  ivaPorcentaje?: number;
}

export async function createPriceList(input: CreatePriceListInput) {
  const { nombre, version, products, vigente = false, ivaPorcentaje = 21 } = input;

  // Si se activa esta lista, desactivar las demás
  if (vigente) {
    await prisma.priceList.updateMany({ data: { vigente: false } });
  }

  const priceList = await prisma.priceList.create({
    data: {
      nombre,
      version,
      vigente,
      products: {
        create: products.map((p) => ({
          codigo: p.codigo,
          descripcion: p.descripcion,
          precioUnidad: p.precioUnidad,
          precioBulto: p.precioBulto,
          ivaPorcentaje,
        })),
      },
    },
    include: { products: true },
  });

  return priceList;
}

export async function activatePriceList(id: number) {
  await prisma.priceList.updateMany({ data: { vigente: false } });
  return prisma.priceList.update({ where: { id }, data: { vigente: true } });
}

export async function deletePriceList(id: number) {
  const pl = await prisma.priceList.findUnique({ where: { id } });
  if (!pl) throw Object.assign(new Error('Lista no encontrada'), { status: 404 });
  if (pl.vigente) throw Object.assign(new Error('No se puede eliminar la lista vigente'), { status: 400 });
  return prisma.priceList.delete({ where: { id } });
}

export async function updateProduct(
  productId: number,
  data: Partial<{ descripcion: string; precioUnidad: number; precioBulto: number | null; ivaPorcentaje: number; activo: boolean }>
) {
  return prisma.product.update({ where: { id: productId }, data });
}

/**
 * Busca un producto por código en la lista vigente.
 */
export async function lookupProductByCode(codigo: string): Promise<import('../calculator/calculator.service').ProductLookup | null> {
  const pl = await prisma.priceList.findFirst({ where: { vigente: true } });
  if (!pl) return null;

  const product = await prisma.product.findFirst({
    where: { codigo, listaPrecioId: pl.id, activo: true },
  });
  return product;
}

/**
 * Retorna un mapa código→producto para la lista vigente (para cálculos en bulk).
 */
export async function getActivePriceMap(): Promise<Map<string, import('../calculator/calculator.service').ProductLookup>> {
  const pl = await prisma.priceList.findFirst({
    where: { vigente: true },
    include: { products: { where: { activo: true } } },
  });

  const map = new Map<string, import('../calculator/calculator.service').ProductLookup>();
  if (!pl) return map;

  for (const p of pl.products) {
    map.set(p.codigo, {
      id: p.id,
      codigo: p.codigo,
      descripcion: p.descripcion,
      precioUnidad: p.precioUnidad,
      precioBulto: p.precioBulto,
      ivaPorcentaje: p.ivaPorcentaje,
    });
  }
  return map;
}
