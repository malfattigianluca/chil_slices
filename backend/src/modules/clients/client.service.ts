import prisma from '../../prisma';
import csv from 'csv-parser';
import fs from 'fs';

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
 * Importa clientes desde un CSV.
 * Columnas esperadas (case insensitive): codigo, cuit, nombre, condicionFiscal,
 * tipoComprobanteHabitual, direccion, telefono, zona, observaciones,
 * aplicaPercepcionIva, alicuotaPercepcionIva, alicuotaPercepcionIibb, iibbPadronPeriodo
 */
export async function importFromCSV(filePath: string): Promise<{ imported: number; errors: string[] }> {
  return new Promise((resolve, reject) => {
    const rows: ClientInput[] = [];
    const errors: string[] = [];

    fs.createReadStream(filePath)
      .pipe(csv({ separator: ';', mapHeaders: ({ header }) => header.trim().toLowerCase() }))
      .on('data', (row) => {
        const codigo = row.codigo?.trim();
        const nombre = row.nombre?.trim();

        if (!codigo || !nombre) {
          errors.push(`Fila omitida: código o nombre vacío → ${JSON.stringify(row)}`);
          return;
        }

        const cuit = normalizeCuit(row.cuit?.trim()) ?? undefined;
        if (row.cuit?.trim() && !cuit) {
          errors.push(`CUIT inválido para cliente ${codigo}: "${row.cuit}"`);
        }

        rows.push({
          codigo,
          cuit,
          nombre,
          condicionFiscal: row.condicionfiscal?.trim(),
          tipoComprobanteHabitual: row.tipocomprobantehabitual?.trim() || row.tipocomprobante?.trim() || row.tipo?.trim() || 'Z',
          aplicaPercepcionIva: parseBooleanLike(row.aplicapercepcioniva) ?? true,
          alicuotaPercepcionIva: parseNumberLike(row.alicuotapercepcioniva) ?? 3,
          alicuotaPercepcionIibb: parseNumberLike(row.alicuotapercepcioniibb) ?? parseNumberLike(row.alicuotaiibb) ?? null,
          iibbPadronPeriodo: row.iibbpadronperiodo?.trim() || undefined,
          direccion: row.direccion?.trim(),
          telefono: row.telefono?.trim(),
          zona: row.zona?.trim(),
          observaciones: row.observaciones?.trim(),
        });
      })
      .on('end', async () => {
        let imported = 0;

        for (const row of rows) {
          try {
            const normalized = normalizeClientData(row);
            await prisma.client.upsert({
              where: { codigo: row.codigo },
              update: normalized,
              create: {
                ...normalized,
                codigo: row.codigo,
                nombre: row.nombre,
                tipoComprobanteHabitual: normalized.tipoComprobanteHabitual || 'Z',
              },
            });
            imported++;
          } catch (e: any) {
            errors.push(`Error en cliente ${row.codigo}: ${e.message}`);
          }
        }

        resolve({ imported, errors });
      })
      .on('error', reject);
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
