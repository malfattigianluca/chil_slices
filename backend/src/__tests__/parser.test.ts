import { parseOrderText, parseMultipleOrders } from '../modules/parser/parser.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function items(parsed: ReturnType<typeof parseOrderText>) {
  return parsed.items;
}

// ─── Detección de modo de cálculo ─────────────────────────────────────────────

describe('detectCalcMode — variantes exactas', () => {
  it('detecta FC_A desde "FC A"', () => {
    const r = parseOrderText('Rojo - FC A - 506=10');
    expect(r.calcMode).toBe('FC_A');
  });

  it('detecta FC_A desde "fca"', () => {
    const r = parseOrderText('Rojo - fca - 506=10');
    expect(r.calcMode).toBe('FC_A');
  });

  it('detecta FC_A desde "factura a"', () => {
    const r = parseOrderText('Rojo - factura a - 506=10');
    expect(r.calcMode).toBe('FC_A');
  });

  it('detecta MITAD desde "mitad"', () => {
    const r = parseOrderText('Rojo - mitad - 506=10');
    expect(r.calcMode).toBe('MITAD');
  });

  it('detecta Z desde "Z"', () => {
    const r = parseOrderText('Rojo - Z - 506=10');
    expect(r.calcMode).toBe('Z');
  });

  it('detecta REMITO desde "remito"', () => {
    const r = parseOrderText('Rojo - remito - 506=10');
    expect(r.calcMode).toBe('REMITO');
  });

  it('usa Z como modo por defecto si no se especifica', () => {
    const r = parseOrderText('Rojo - 506=10');
    expect(r.calcMode).toBe('Z');
  });
});

describe('detectCalcMode — variantes con typos (requiere F1)', () => {
  it('detecta MITAD desde "mitd"', () => {
    const r = parseOrderText('Rojo - mitd - 506=10');
    expect(r.calcMode).toBe('MITAD');
  });

  it('detecta MITAD desde "mtiad"', () => {
    const r = parseOrderText('Rojo - mtiad - 506=10');
    expect(r.calcMode).toBe('MITAD');
  });

  it('detecta FC_A desde "fca21"', () => {
    const r = parseOrderText('Rojo - fca21 - 506=10');
    expect(r.calcMode).toBe('FC_A');
  });

  it('detecta REMITO desde "rem"', () => {
    const r = parseOrderText('Rojo - rem - 506=10');
    expect(r.calcMode).toBe('REMITO');
  });
});

// ─── Detección de cliente ──────────────────────────────────────────────────────

describe('detección de cliente', () => {
  it('extrae clientName desde token de texto libre', () => {
    const r = parseOrderText('Rojo - FC A - 506=10');
    expect(r.clientName).toBe('Rojo');
  });

  it('extrae clientCode numérico desde sección con ":"', () => {
    const r = parseOrderText('Rojo - 339: mitad - 506=10');
    expect(r.clientCode).toBe('339');
    expect(r.clientName).toBe('Rojo');
  });

  it('extrae código numérico como clientCode cuando se usa formato con ":"', () => {
    // Sin ":", un código numérico es ambiguo con un código de producto.
    // El formato canónico para código numérico de cliente es: "1234: Z - 506=10"
    const r = parseOrderText('1234: Z - 506=10');
    expect(r.clientCode).toBe('1234');
  });

  it('extrae nombre multipalabra desde token de texto libre', () => {
    const r = parseOrderText('Super Mercado Rojo - Z - 506=2');
    expect(r.clientName).toBe('Super Mercado Rojo');
  });
});

// ─── Parseo de productos ───────────────────────────────────────────────────────

describe('parseo de productos — formato básico', () => {
  it('parsea producto con "=" y cantidad entera', () => {
    const r = parseOrderText('Rojo - Z - 506=10');
    expect(items(r)).toHaveLength(1);
    expect(items(r)[0]).toMatchObject({ code: '506', quantity: 10 });
  });

  it('parsea múltiples productos', () => {
    const r = parseOrderText('Rojo - Z - 506=10 - 524=1 - 655=3');
    expect(items(r)).toHaveLength(3);
    expect(items(r)[1]).toMatchObject({ code: '524', quantity: 1 });
  });

  it('parsea producto con cantidad decimal (coma)', () => {
    const r = parseOrderText('Rojo - Z - 506=1,5');
    expect(items(r)[0].quantity).toBeCloseTo(1.5);
  });

  it('parsea producto con código solo (cantidad implícita 1)', () => {
    const r = parseOrderText('Rojo - Z - 506');
    expect(items(r)[0]).toMatchObject({ code: '506', quantity: 1 });
  });

  it('genera warning para token no reconocido', () => {
    const r = parseOrderText('Rojo - Z - 506=10 - textoRaro');
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.warnings[0]).toContain('textoRaro');
  });
});

// ─── Bonificaciones cod=cant+bonus (requiere B4) ──────────────────────────────

describe('parseo de bonificaciones — cod=cant+bonus', () => {
  it('parsea bonificación simple: 605=10+1', () => {
    const r = parseOrderText('Rojo - Z - 605=10+1');
    expect(items(r)).toHaveLength(1);
    expect(items(r)[0]).toMatchObject({
      code: '605',
      quantity: 10,
      cantidadBonificada: 1,
    });
  });

  it('parsea bonificación con cantidad mayor: 601=20+2', () => {
    const r = parseOrderText('Rojo - Z - 601=20+2');
    expect(items(r)[0]).toMatchObject({
      code: '601',
      quantity: 20,
      cantidadBonificada: 2,
    });
  });

  it('parsea pedido mixto: algunos con bonus, otros sin', () => {
    const r = parseOrderText('Rojo - Z - 605=10+1 - 506=4');
    expect(items(r)).toHaveLength(2);
    expect(items(r)[0]).toMatchObject({ code: '605', quantity: 10, cantidadBonificada: 1 });
    expect(items(r)[1]).toMatchObject({ code: '506', quantity: 4, cantidadBonificada: 0 });
  });

  it('sin bonus: cantidadBonificada es 0', () => {
    const r = parseOrderText('Rojo - Z - 506=10');
    expect(items(r)[0].cantidadBonificada).toBe(0);
  });
});

// ─── Múltiples pedidos ────────────────────────────────────────────────────────

describe('parseMultipleOrders', () => {
  it('separa pedidos por salto de línea', () => {
    const text = 'Rojo - Z - 506=10\nAzul - FC A - 524=1';
    const results = parseMultipleOrders(text);
    expect(results).toHaveLength(2);
    expect(results[0].calcMode).toBe('Z');
    expect(results[1].calcMode).toBe('FC_A');
  });

  it('ignora líneas vacías', () => {
    const text = 'Rojo - Z - 506=10\n\nAzul - Z - 524=1';
    expect(parseMultipleOrders(text)).toHaveLength(2);
  });
});

// ─── Normalización y tolerancia ───────────────────────────────────────────────

describe('normalización de input', () => {
  it('tolera espacios extra alrededor de separadores', () => {
    const r = parseOrderText('Rojo  -  Z  -  506 = 10');
    expect(items(r)[0]).toMatchObject({ code: '506', quantity: 10 });
  });

  it('tolera mayúsculas/minúsculas en modo', () => {
    const r = parseOrderText('Rojo - MITAD - 506=10');
    expect(r.calcMode).toBe('MITAD');
  });

  it('devuelve texto original en rawText', () => {
    const text = 'Rojo - Z - 506=10';
    const r = parseOrderText(text);
    expect(r.rawText).toBe(text);
  });

  it('maneja texto vacío sin romper', () => {
    const r = parseOrderText('');
    expect(r.items).toHaveLength(0);
    expect(r.warnings).toHaveLength(0);
  });
});
