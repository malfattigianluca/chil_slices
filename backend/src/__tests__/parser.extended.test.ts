/**
 * Tests extendidos para el parser.
 * Cubren casos borde no incluidos en parser.test.ts:
 *   - Nombres de cliente con alias de modo (Bug B6)
 *   - Formato con ':' complejo
 *   - Múltiples pedidos con separador ';'
 *   - Cantidad decimal con punto
 *   - Código alfanumérico de cliente
 *   - Tokens ambiguos
 *   - parseArgPrice casos borde
 */

import { parseOrderText, parseMultipleOrders, parseArgPrice } from '../modules/parser/parser.service';

// ─── Bug B6: nombres de cliente que son alias de modo ─────────────────────────

describe('Bug B6 — nombre cliente vs alias de modo (casos conocidos)', () => {
  it('cliente "Farmacia" no se detecta como modo', () => {
    // "Farmacia" no coincide exactamente con ningún alias y es > 12 chars? No, 8 chars.
    // Sin ':', el primer token de texto libre (antes de modo) es el cliente.
    const r = parseOrderText('Farmacia - Z - 506=10');
    expect(r.clientName).toBe('Farmacia');
    expect(r.calcMode).toBe('Z');
  });

  it('cliente con código explícito (con ":") evita ambigüedad', () => {
    const r = parseOrderText('Fca Perez - 339: Z - 506=10');
    expect(r.clientCode).toBe('339');
    expect(r.clientName).toBe('Fca Perez');
    expect(r.calcMode).toBe('Z');
  });

  it('token "rem" como modo, no como cliente', () => {
    // Sin nombre explícito antes del modo
    const r = parseOrderText('rem - 506=10');
    // "rem" es alias de REMITO, si el parser lo detecta como modo, el clientName queda null
    // Si queda null es comportamiento documentado (no es un bug si no hay texto previo)
    expect(r.calcMode).toBe('REMITO');
  });

  it('cliente con nombre antes del modo "mitad"', () => {
    const r = parseOrderText('Distribuidora Norte - mitad - 506=5');
    expect(r.clientName).toBe('Distribuidora Norte');
    expect(r.calcMode).toBe('MITAD');
  });
});

// ─── Formato con ':' variantes ────────────────────────────────────────────────

describe('formato con colon ":" — variantes', () => {
  it('código alfanumérico de cliente (ej: "C123")', () => {
    const r = parseOrderText('Empresa SA - C123: Z - 506=10');
    expect(r.clientCode).toBe('C123');
    expect(r.clientName).toBe('Empresa SA');
  });

  it('solo código sin nombre: "339: Z - 506=10"', () => {
    const r = parseOrderText('339: Z - 506=10');
    expect(r.clientCode).toBe('339');
    expect(r.clientName).toBeNull();
  });

  it('nombre con guión compuesto: "Sol - Manu - 339: Z - 506=10"', () => {
    const r = parseOrderText('Sol - Manu - 339: Z - 506=10');
    expect(r.clientCode).toBe('339');
    expect(r.clientName).toBe('Sol - Manu');
  });

  it('modo después del colon se detecta correctamente', () => {
    const r = parseOrderText('Rojo - 339: FC A - 506=10');
    expect(r.calcMode).toBe('FC_A');
  });
});

// ─── parseArgPrice — casos borde ──────────────────────────────────────────────

describe('parseArgPrice — formatos de precio', () => {
  it('número entero "500"', () => {
    expect(parseArgPrice('500')).toBe(500);
  });

  it('decimal con coma "1234,56"', () => {
    expect(parseArgPrice('1234,56')).toBeCloseTo(1234.56);
  });

  it('miles con punto, decimal con coma "1.234,56"', () => {
    expect(parseArgPrice('1.234,56')).toBeCloseTo(1234.56);
  });

  it('decimal con punto "1234.56"', () => {
    expect(parseArgPrice('1234.56')).toBeCloseTo(1234.56);
  });

  it('cadena vacía devuelve NaN', () => {
    expect(parseArgPrice('')).toBeNaN();
  });

  it('solo letras devuelve NaN', () => {
    expect(parseArgPrice('abc')).toBeNaN();
  });
});

// ─── Múltiples pedidos con separador ';' ─────────────────────────────────────

describe('parseMultipleOrders — separadores', () => {
  it('separa por ";" además de newline', () => {
    const text = 'Rojo - Z - 506=10;Azul - FC A - 524=1';
    const results = parseMultipleOrders(text);
    expect(results).toHaveLength(2);
    expect(results[0].clientName).toBe('Rojo');
    expect(results[1].calcMode).toBe('FC_A');
  });

  it('mezcla de newline y ";"', () => {
    const text = 'Rojo - Z - 506=10\nAzul - Z - 524=1;Verde - MITAD - 655=3';
    expect(parseMultipleOrders(text)).toHaveLength(3);
  });

  it('líneas vacías entre pedidos son ignoradas', () => {
    const text = '\nRojo - Z - 506=10\n\n\nAzul - Z - 524=1\n';
    expect(parseMultipleOrders(text)).toHaveLength(2);
  });
});

// ─── Cantidad decimal con punto ───────────────────────────────────────────────

describe('parseo de cantidad decimal', () => {
  it('cantidad con punto "1.5"', () => {
    const r = parseOrderText('Rojo - Z - 506=1.5');
    expect(r.items[0].quantity).toBeCloseTo(1.5);
  });

  it('cantidad con coma "2,5"', () => {
    const r = parseOrderText('Rojo - Z - 506=2,5');
    expect(r.items[0].quantity).toBeCloseTo(2.5);
  });
});

// ─── Warnings y robustez ──────────────────────────────────────────────────────

describe('warnings y robustez del parser', () => {
  it('token unrecognized genera warning con el texto del token', () => {
    const r = parseOrderText('Rojo - Z - 506=10 - tokenRaro');
    expect(r.warnings.some((w) => w.includes('tokenRaro'))).toBe(true);
  });

  it('texto con solo modo produce items vacíos', () => {
    const r = parseOrderText('Z');
    expect(r.items).toHaveLength(0);
    expect(r.calcMode).toBe('Z');
  });

  it('texto nulo/vacío no rompe', () => {
    expect(() => parseOrderText('')).not.toThrow();
    expect(() => parseOrderText('   ')).not.toThrow();
  });

  it('pedido sin modo usa Z por defecto', () => {
    const r = parseOrderText('Rojo - 506=10');
    expect(r.calcMode).toBe('Z');
  });

  it('código de producto de 2 dígitos con cantidad explícita funciona', () => {
    // Nota: código 2 dígitos con "=" sí se parsea (patron /^(\d{2,8})\s*[=:]\s*.../)
    const r = parseOrderText('Rojo - Z - 99=5');
    expect(r.items).toHaveLength(1);
    expect(r.items[0].code).toBe('99');
    expect(r.items[0].quantity).toBe(5);
  });
});

// ─── Fuzzy mode detection ─────────────────────────────────────────────────────

describe('detección fuzzy de modo con typos', () => {
  it('"fca " (espacio trailing) se detecta como FC_A', () => {
    const r = parseOrderText('Rojo - fca  - 506=10');
    expect(r.calcMode).toBe('FC_A');
  });

  it('"MITAD" en mayúsculas se detecta correctamente', () => {
    const r = parseOrderText('Rojo - MITAD - 506=10');
    expect(r.calcMode).toBe('MITAD');
  });

  it('"half" (alias inglés) se detecta como MITAD', () => {
    const r = parseOrderText('Rojo - half - 506=10');
    expect(r.calcMode).toBe('MITAD');
  });

  it('"iva" (alias) se detecta como FC_A', () => {
    const r = parseOrderText('Rojo - iva - 506=10');
    expect(r.calcMode).toBe('FC_A');
  });
});
