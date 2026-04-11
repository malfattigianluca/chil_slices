import prisma from '../../prisma';
import csv from 'csv-parser';
import fs from 'fs';
import { Readable } from 'stream';

export interface ClientInput {
  codigo: string;
  cuit?: string;
  nombre: string;
  condicionFiscal?: string;
  tipoComprobanteHabitual?: string;
  aplicaPercepcionIva?: boolean;
  alicuotaPercepcionIva?: number;
  alicuotaPercepcionIibb?: number | null;
  iibbPadronPeriodo?: string;
  iibbPadronActualizadoAt?: Date;
  direccion?: string;
  telefono?: string;
  zona?: string;
  observaciones?: string;
}

export interface ImportArbaPadronResult {
  periodo: string;
  rows: number;
  parsed: number;
  updatedClients: number;
  notFoundClients: number;
  invalidRows: number;
  notFoundCuits: string[];
}

function normalizeCuit(value?: string | null): string | undefined {
  if (!value) return undefined;
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 11) return undefined;
  return digits;
}

function parseNumberLike(value?: string | number | null): number | undefined {
  if (value == null || value === '') return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;

  let s = value.trim();
  if (!s) return undefined;

  s = s.replace(/[^\d,.\-]/g, '');
  if (!s) return undefined;

  if (s.includes(',') && s.includes('.')) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }

  const n = Number.parseFloat(s);
  return Number.isNaN(n) ? undefined : n;
}

function parseBooleanLike(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (value == null) return undefined;

  const s = String(value).trim().toLowerCase();
  if (!s) return undefined;
  if (['1', 'true', 'si', 'sí', 's', 'yes', 'y'].includes(s)) return true;
  if (['0', 'false', 'no', 'n'].includes(s)) return false;
  return undefined;
}

function normalizePeriod(period?: string): string {
  if (!period) return getCurrentFiscalPeriod();
  const trimmed = period.trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(trimmed)) {
    throw Object.assign(new Error('Período inválido. Usar formato YYYY-MM'), { status: 400 });
  }
  return trimmed;
}

function getCurrentFiscalPeriod(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);

  const year = parts.find((p) => p.type === 'year')?.value ?? '';
  const month = parts.find((p) => p.type === 'month')?.value ?? '';

  if (!year || !month) {
    const fallback = new Date();
    return `${fallback.getFullYear()}-${String(fallback.getMonth() + 1).padStart(2, '0')}`;
  }

  return `${year}-${month}`;
}

function normalizeClientData(data: Partial<ClientInput>): Partial<ClientInput> {
  const normalized: Partial<ClientInput> = { ...data };

  if (Object.prototype.hasOwnProperty.call(data, 'cuit')) {
    normalized.cuit = normalizeCuit(data.cuit) ?? undefined;
  }

  if (Object.prototype.hasOwnProperty.call(data, 'alicuotaPercepcionIva')) {
    const parsed = parseNumberLike(data.alicuotaPercepcionIva ?? null);
    normalized.alicuotaPercepcionIva = parsed ?? undefined;
  }

  if (Object.prototype.hasOwnProperty.call(data, 'alicuotaPercepcionIibb')) {
    if (data.alicuotaPercepcionIibb == null) {
      normalized.alicuotaPercepcionIibb = null;
    } else {
      const parsed = parseNumberLike(data.alicuotaPercepcionIibb);
      normalized.alicuotaPercepcionIibb = parsed ?? null;
    }
  }

  if (Object.prototype.hasOwnProperty.call(data, 'aplicaPercepcionIva')) {
    const parsed = parseBooleanLike(data.aplicaPercepcionIva);
    normalized.aplicaPercepcionIva = parsed ?? true;
  }

  if (Object.prototype.hasOwnProperty.call(data, 'iibbPadronPeriodo') && data.iibbPadronPeriodo) {
    normalized.iibbPadronPeriodo = normalizePeriod(data.iibbPadronPeriodo);
  }

  return normalized;
}

function isHeaderLine(line: string): boolean {
  const l = line.toLowerCase();
  return l.includes('cuit')
    || l.includes('alicuota')
    || l.includes('alícuota')
    || l.includes('percepcion')
    || l.includes('percepción')
    || l.includes('retencion')
    || l.includes('retención');
}

function parsePadronLine(line: string): { cuit: string; alicuota: number } | null {
  const cleaned = line.trim();
  if (!cleaned) return null;
  if (isHeaderLine(cleaned)) return null;

  const cuit = normalizeCuit(cleaned) ?? normalizeCuit(cleaned.match(/\d{11}/)?.[0]);
  if (!cuit) return null;

  const numericCandidates: number[] = [];

  const withoutCuit = cleaned.replace(cuit, ' ');
  for (const match of withoutCuit.matchAll(/-?\d+(?:[.,]\d+)?/g)) {
    const n = parseNumberLike(match[0]);
    if (n == null) continue;

    // Evitar tomar el CUIT completo como alícuota.
    if (Math.abs(n) > 100) continue;
    if (n < 0) continue;
    numericCandidates.push(n);
  }

  if (numericCandidates.length === 0) return null;

  return {
    cuit,
    alicuota: numericCandidates[numericCandidates.length - 1],
  };
}

export async function getAll(search?: string) {
  return prisma.client.findMany({
    where: search
      ? {
          OR: [
            { nombre: { contains: search } },
            { codigo: { contains: search } },
            { cuit: { contains: search } },
            { zona: { contains: search } },
          ],
        }
      : undefined,
    orderBy: { nombre: 'asc' },
  });
}

export async function getById(id: number) {
  const c = await prisma.client.findUnique({ where: { id } });
  if (!c) throw Object.assign(new Error('Cliente no encontrado'), { status: 404 });
  return c;
}

export async function getByCode(codigo: string) {
  return prisma.client.findFirst({ where: { codigo } });
}

export async function create(data: ClientInput) {
  const normalized = normalizeClientData(data);
  return prisma.client.create({
    data: {
      codigo: data.codigo,
      nombre: data.nombre,
      cuit: normalized.cuit,
      condicionFiscal: normalized.condicionFiscal,
      tipoComprobanteHabitual: normalized.tipoComprobanteHabitual || 'Z',
      aplicaPercepcionIva: normalized.aplicaPercepcionIva,
      alicuotaPercepcionIva: normalized.alicuotaPercepcionIva,
      alicuotaPercepcionIibb: normalized.alicuotaPercepcionIibb,
      iibbPadronPeriodo: normalized.iibbPadronPeriodo,
      iibbPadronActualizadoAt: normalized.iibbPadronActualizadoAt,
      direccion: normalized.direccion,
      telefono: normalized.telefono,
      zona: normalized.zona,
      observaciones: normalized.observaciones,
    },
  });
}

export async function update(id: number, data: Partial<ClientInput>) {
  const normalized = normalizeClientData(data);
  return prisma.client.update({ where: { id }, data: normalized });
}

export async function remove(id: number) {
  return prisma.client.delete({ where: { id } });
}

/**
 * Normaliza un nombre de columna CSV para comparación flexible.
 * Minúsculas, sin acentos, sin espacios/guiones/puntos/subrayados.
 */
function normalizeHeaderKey(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quitar diacríticos
    .replace(/[\s._\-]+/g, '');       // quitar separadores
}

/**
 * Mapa de nombres alternativos de columna al nombre canónico interno.
 * Todas las claves ya están normalizadas (sin acentos, sin espacios, minúsculas).
 */
const CSV_HEADER_MAP: Record<string, string> = {
  // Código
  codigo: 'codigo', cod: 'codigo', codcliente: 'codigo', codigocliente: 'codigo',
  // Nombre / razón social
  nombre: 'nombre', razonsocial: 'nombre', razon: 'nombre', denominacion: 'nombre',
  empresa: 'nombre', cliente: 'nombre', descripcion: 'nombre',
  // CUIT
  cuit: 'cuit', cuil: 'cuit',
  // Condición fiscal
  condicionfiscal: 'condicionFiscal', condicion: 'condicionFiscal',
  categoriaiva: 'condicionFiscal', categoría: 'condicionFiscal',
  // Tipo comprobante
  tipocomprobantehabitual: 'tipoComprobanteHabitual',
  tipocomprobante: 'tipoComprobanteHabitual', tipo: 'tipoComprobanteHabitual',
  comprobante: 'tipoComprobanteHabitual',
  // Percepción IVA
  aplicapercepcioniva: 'aplicaPercepcionIva', aplicaperceiva: 'aplicaPercepcionIva',
  perceiva: 'aplicaPercepcionIva',
  alicuotapercepcioniva: 'alicuotaPercepcionIva', alicuotaiva: 'alicuotaPercepcionIva',
  alicuotaperiva: 'alicuotaPercepcionIva',
  // Percepción IIBB
  alicuotapercepcioniibb: 'alicuotaPercepcionIibb', alicuotaiibb: 'alicuotaPercepcionIibb',
  alicuota: 'alicuotaPercepcionIibb', iibb: 'alicuotaPercepcionIibb',
  // Padrón IIBB
  iibbpadronperiodo: 'iibbPadronPeriodo', padronperiodo: 'iibbPadronPeriodo',
  periodo: 'iibbPadronPeriodo',
  // Contacto
  direccion: 'direccion', domicilio: 'direccion',
  telefono: 'telefono', tel: 'telefono', celular: 'telefono',
  zona: 'zona', localidad: 'zona', ciudad: 'zona',
  observaciones: 'observaciones', obs: 'observaciones', notas: 'observaciones',
};

/**
 * Importa clientes desde un CSV.
 * Soporta:
 *  - Delimitador ';' y ',' (detección automática)
 *  - UTF-8 con o sin BOM, Latin-1
 *  - Nombres de columna alternativos (código, razonSocial, etc.)
 *  - Reporte de errores por fila con número y motivo
 */
export async function importFromCSV(filePath: string): Promise<{
  imported: number;
  updated: number;
  omitted: number;
  errors: string[];
}> {
  // ── 1. Leer bytes crudos ─────────────────────────────────────────────────
  const rawBuffer = fs.readFileSync(filePath);

  // ── 2. Quitar BOM UTF-8 (EF BB BF) y decodificar ─────────────────────────
  let content: string;
  if (rawBuffer[0] === 0xEF && rawBuffer[1] === 0xBB && rawBuffer[2] === 0xBF) {
    content = rawBuffer.slice(3).toString('utf8');
  } else {
    content = rawBuffer.toString('utf8');
    // Si hay caracteres de reemplazo, intentar Latin-1
    if (content.includes('\uFFFD')) {
      content = rawBuffer.toString('latin1');
    }
  }

  // ── 3. Detectar delimitador ───────────────────────────────────────────────
  const firstLine = content.split(/\r?\n/).find((l) => l.trim()) ?? '';
  const semicolons = (firstLine.match(/;/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  const delimiter = semicolons >= commas ? ';' : ',';

  // ── 4. Parsear CSV ────────────────────────────────────────────────────────
  return new Promise((resolve, reject) => {
    const errors: string[] = [];
    const rows: Array<ClientInput & { _row: number }> = [];
    let rowNum = 0;

    const readable = Readable.from([content]);

    readable
      .pipe(csv({
        separator: delimiter,
        mapHeaders: ({ header }) => {
          const key = normalizeHeaderKey(header);
          return CSV_HEADER_MAP[key] ?? key;
        },
      }))
      .on('data', (row) => {
        rowNum++;
        const codigo = row.codigo?.trim();
        const nombre = row.nombre?.trim();

        if (!codigo) {
          errors.push(`Fila ${rowNum + 1}: código vacío — ${JSON.stringify(row)}`);
          return;
        }
        if (!nombre) {
          errors.push(`Fila ${rowNum + 1}: nombre vacío (código: ${codigo})`);
          return;
        }

        const rawCuit = row.cuit?.trim();
        const cuit = rawCuit ? normalizeCuit(rawCuit) : undefined;
        if (rawCuit && !cuit) {
          // CUIT inválido: lo registramos pero seguimos importando sin CUIT
          errors.push(`Fila ${rowNum + 1} (${codigo}): CUIT inválido "${rawCuit}" — importado sin CUIT`);
        }

        rows.push({
          _row: rowNum + 1,
          codigo,
          cuit,
          nombre,
          condicionFiscal: row.condicionFiscal?.trim() || undefined,
          tipoComprobanteHabitual: row.tipoComprobanteHabitual?.trim() || 'Z',
          aplicaPercepcionIva: parseBooleanLike(row.aplicaPercepcionIva) ?? true,
          alicuotaPercepcionIva: parseNumberLike(row.alicuotaPercepcionIva) ?? 3,
          alicuotaPercepcionIibb: parseNumberLike(row.alicuotaPercepcionIibb) ?? null,
          iibbPadronPeriodo: row.iibbPadronPeriodo?.trim() || undefined,
          direccion: row.direccion?.trim() || undefined,
          telefono: row.telefono?.trim() || undefined,
          zona: row.zona?.trim() || undefined,
          observaciones: row.observaciones?.trim() || undefined,
        });
      })
      .on('end', async () => {
        let imported = 0;
        let updated = 0;

        for (const { _row, ...data } of rows) {
          try {
            const normalized = normalizeClientData(data as ClientInput);
            const existing = await prisma.client.findUnique({ where: { codigo: data.codigo } });
            await prisma.client.upsert({
              where: { codigo: data.codigo },
              update: normalized,
              create: {
                ...normalized,
                codigo: data.codigo,
                nombre: data.nombre,
                tipoComprobanteHabitual: normalized.tipoComprobanteHabitual || 'Z',
              },
            });
            if (existing) updated++;
            else imported++;
          } catch (e: any) {
            errors.push(`Fila ${_row} (${data.codigo}): ${e.message}`);
          }
        }

        resolve({ imported, updated, omitted: 0, errors });
      })
      .on('error', (err) => reject(err));
  });
}

/**
 * Importa padrón ARBA mensual con formato flexible.
 * Intenta extraer CUIT + alícuota desde cada línea.
 */
export async function importArbaPadron(filePath: string, period?: string): Promise<ImportArbaPadronResult> {
  const periodo = normalizePeriod(period);
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const parsedRows = new Map<string, number>();
  let invalidRows = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (isHeaderLine(line)) continue;

    const parsed = parsePadronLine(line);
    if (!parsed) {
      invalidRows++;
      continue;
    }

    parsedRows.set(parsed.cuit, parsed.alicuota);
  }

  let updatedClients = 0;
  let notFoundClients = 0;
  const notFoundCuits: string[] = [];
  const now = new Date();

  for (const [cuit, alicuota] of parsedRows.entries()) {
    const updated = await prisma.client.updateMany({
      where: { cuit },
      data: {
        alicuotaPercepcionIibb: alicuota,
        iibbPadronPeriodo: periodo,
        iibbPadronActualizadoAt: now,
      },
    });

    if (updated.count > 0) {
      updatedClients += updated.count;
    } else {
      notFoundClients++;
      if (notFoundCuits.length < 25) notFoundCuits.push(cuit);
    }
  }

  return {
    periodo,
    rows: lines.length,
    parsed: parsedRows.size,
    updatedClients,
    notFoundClients,
    invalidRows,
    notFoundCuits,
  };
}

export { getCurrentFiscalPeriod };
