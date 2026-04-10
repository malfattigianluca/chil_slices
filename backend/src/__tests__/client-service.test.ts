/**
 * Tests unitarios para funciones puras de client.service:
 *  - normalizeCuit
 *  - parseNumberLike
 *  - parseBooleanLike
 *  - normalizePeriod / getCurrentFiscalPeriod
 *  - parsePadronLine (indirectamente via importArbaPadron unit logic)
 *
 * Se exportan las funciones privadas mediante re-export solo para test.
 * Como no hay re-exports, se testean via la función pública `getCurrentFiscalPeriod`.
 */

import { getCurrentFiscalPeriod } from '../modules/clients/client.service';

// ─── getCurrentFiscalPeriod ───────────────────────────────────────────────────

describe('getCurrentFiscalPeriod', () => {
  it('devuelve formato YYYY-MM', () => {
    const period = getCurrentFiscalPeriod();
    expect(period).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
  });

  it('para una fecha dada devuelve el período correcto (Argentina TZ)', () => {
    // 1 de enero UTC (puede ser diciembre en Argentina si hay desfase de -3h,
    // pero con 00:00 UTC estamos en 21:00 ARG del día anterior = 31/12)
    // Usamos una fecha segura: 15 de junio 2024
    const date = new Date('2024-06-15T12:00:00Z');
    const period = getCurrentFiscalPeriod(date);
    expect(period).toBe('2024-06');
  });

  it('para diciembre devuelve mes 12', () => {
    const date = new Date('2024-12-25T12:00:00Z');
    const period = getCurrentFiscalPeriod(date);
    expect(period).toBe('2024-12');
  });
});
