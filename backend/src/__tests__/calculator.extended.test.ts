/**
 * Tests extendidos para el motor de cálculo.
 * Cubren casos borde no incluidos en calculator.test.ts:
 *   - MITAD con cantidades extremas (0, 1, impar grande)
 *   - MITAD totalFinal con percepciones solo FC_A
 *   - REMITO vs Z: mismo comportamiento
 *   - rebuildFromItems consistencia con calculateOrder
 *   - Precio unitario vs bulto (prioridad)
 *   - IVA diferente al 21%
 *   - Múltiples productos, mezcla encontrado/no encontrado
 */

import {
  calculateOrder,
  rebuildFromItems,
  CalculationContext,
  ProductLookup,
  CalculatedItem,
} from '../modules/calculator/calculator.service';
import { ParsedItem } from '../modules/parser/parser.service';

function makeProduct(overrides: Partial<ProductLookup> = {}): ProductLookup {
  return {
    id: 1,
    codigo: '506',
    descripcion: 'Producto Test',
    precioUnidad: 100,
    precioBulto: 800,
    ivaPorcentaje: 21,
    ...overrides,
  };
}

function makeItem(overrides: Partial<ParsedItem> = {}): ParsedItem {
  return {
    code: '506',
    quantity: 1,
    isMitad: false,
    cantidadBonificada: 0,
    ...overrides,
  };
}

function makeLookup(products: ProductLookup[]) {
  const map = new Map(products.map((p) => [p.codigo, p]));
  return (code: string) => map.get(code) ?? null;
}

const noPercepcion: CalculationContext = {
  aplicaPercepcionIva: false,
  alicuotaPercepcionIva: 0,
  alicuotaPercepcionIibb: 0,
};

const conAmbas: CalculationContext = {
  aplicaPercepcionIva: true,
  alicuotaPercepcionIva: 3,
  alicuotaPercepcionIibb: 1.5,
};

// ─── REMITO vs Z ─────────────────────────────────────────────────────────────

describe('REMITO vs Z — comportamiento idéntico en precios', () => {
  const lookup = makeLookup([makeProduct()]);

  it('REMITO y Z producen el mismo total para misma cantidad', () => {
    const rZ = calculateOrder('Z', [makeItem({ quantity: 5 })], lookup, noPercepcion);
    const rR = calculateOrder('REMITO', [makeItem({ quantity: 5 })], lookup, noPercepcion);
    expect(rZ.totalFinal).toBe(rR.totalFinal);
    expect(rZ.subtotalNeto).toBe(rR.subtotalNeto);
  });

  it('REMITO tiene tipoLinea REMITO, Z tiene tipoLinea Z', () => {
    const rZ = calculateOrder('Z', [makeItem()], lookup, noPercepcion);
    const rR = calculateOrder('REMITO', [makeItem()], lookup, noPercepcion);
    expect(rZ.items[0].tipoLinea).toBe('Z');
    expect(rR.items[0].tipoLinea).toBe('REMITO');
  });

  it('REMITO no discrimina IVA (neto es null)', () => {
    const r = calculateOrder('REMITO', [makeItem()], lookup, noPercepcion);
    expect(r.items[0].neto).toBeNull();
    expect(r.items[0].iva).toBeNull();
  });

  it('Z no aplica percepciones (subtotalNeto = 0 → percepcion = 0)', () => {
    const r = calculateOrder('Z', [makeItem()], lookup, conAmbas);
    expect(r.percepcionIva).toBe(0);
    expect(r.percepcionIibb).toBe(0);
  });
});

// ─── Precio unitario vs bulto ─────────────────────────────────────────────────

describe('prioridad de precio: precioBulto sobre precioUnidad', () => {
  it('usa precioBulto cuando está definido', () => {
    const p = makeProduct({ precioUnidad: 100, precioBulto: 800 });
    const r = calculateOrder('Z', [makeItem({ quantity: 2 })], makeLookup([p]), noPercepcion);
    expect(r.items[0].precioAplicado).toBe(800);
    expect(r.items[0].total).toBe(1600);
  });

  it('cae a precioUnidad cuando precioBulto es null', () => {
    const p = makeProduct({ precioUnidad: 150, precioBulto: null });
    const r = calculateOrder('Z', [makeItem({ quantity: 2 })], makeLookup([p]), noPercepcion);
    expect(r.items[0].precioAplicado).toBe(150);
    expect(r.items[0].total).toBe(300);
  });
});

// ─── IVA diferente al 21% ─────────────────────────────────────────────────────

describe('FC_A con IVA distinto al 21%', () => {
  it('descuenta correctamente IVA 10.5%', () => {
    const p = makeProduct({ precioBulto: 110.5, ivaPorcentaje: 10.5 });
    const r = calculateOrder('FC_A', [makeItem({ quantity: 1 })], makeLookup([p]), noPercepcion);
    const netoEsperado = 110.5 / 1.105;
    expect(r.items[0].neto).toBeCloseTo(netoEsperado, 2);
    expect(r.items[0].iva).toBeCloseTo(110.5 - netoEsperado, 2);
  });

  it('descuenta correctamente IVA 27%', () => {
    const p = makeProduct({ precioBulto: 127, ivaPorcentaje: 27 });
    const r = calculateOrder('FC_A', [makeItem({ quantity: 1 })], makeLookup([p]), noPercepcion);
    expect(r.items[0].neto).toBeCloseTo(127 / 1.27, 2);
  });
});

// ─── MITAD — casos borde de cantidad ─────────────────────────────────────────

describe('MITAD — cantidades extremas', () => {
  const prod = makeProduct({ codigo: '601', precioBulto: 500 });
  const lookup = makeLookup([prod]);

  it('cantidad 2: FC_A=1, Remito=1', () => {
    const r = calculateOrder('MITAD', [makeItem({ code: '601', quantity: 2 })], lookup, noPercepcion);
    expect(r.groupFCA![0].cantidad).toBe(1);
    expect(r.groupRemito![0].cantidad).toBe(1);
  });

  it('cantidad 3: FC_A=1 (floor), Remito=2 (ceil)', () => {
    const r = calculateOrder('MITAD', [makeItem({ code: '601', quantity: 3 })], lookup, noPercepcion);
    expect(r.groupFCA![0].cantidad).toBe(1);
    expect(r.groupRemito![0].cantidad).toBe(2);
  });

  it('cantidad 10: distribución exacta 5/5', () => {
    const r = calculateOrder('MITAD', [makeItem({ code: '601', quantity: 10 })], lookup, noPercepcion);
    expect(r.groupFCA![0].cantidad).toBe(5);
    expect(r.groupRemito![0].cantidad).toBe(5);
  });

  it('subtotalFCA + subtotalRemito = totalFinal (sin percepciones)', () => {
    const r = calculateOrder('MITAD', [makeItem({ code: '601', quantity: 6 })], lookup, noPercepcion);
    expect(r.subtotalFCA! + r.subtotalRemito!).toBeCloseTo(r.totalFinal, 2);
  });
});

// ─── MITAD — percepciones SOLO sobre FC_A (verificación del fix B1) ───────────

describe('MITAD — percepciones solo sobre parte FC_A', () => {
  const prod = makeProduct({ codigo: '601', precioBulto: 500 });
  const lookup = makeLookup([prod]);

  it('percepcionIva = netoFCA * alicuota (no incluye Remito estimado)', () => {
    const r = calculateOrder('MITAD', [makeItem({ code: '601', quantity: 4 })], lookup, {
      aplicaPercepcionIva: true,
      alicuotaPercepcionIva: 3,
      alicuotaPercepcionIibb: 0,
    });
    // qty 4 → FC_A=2, Remito=2
    const netoFCA = (2 * 500) / 1.21;
    expect(r.percepcionIva).toBeCloseTo(netoFCA * 0.03, 2);
  });

  it('percepcionIibb = netoFCA * alicuota (no incluye Remito)', () => {
    const r = calculateOrder('MITAD', [makeItem({ code: '601', quantity: 6 })], lookup, {
      aplicaPercepcionIva: false,
      alicuotaPercepcionIva: 0,
      alicuotaPercepcionIibb: 1.5,
    });
    // qty 6 → FC_A=3, Remito=3
    const netoFCA = (3 * 500) / 1.21;
    expect(r.percepcionIibb).toBeCloseTo(netoFCA * 0.015, 2);
  });

  it('cantidad 1 → FC_A=0 → percepcionIva=0 aunque aplique', () => {
    const r = calculateOrder('MITAD', [makeItem({ code: '601', quantity: 1 })], lookup, {
      aplicaPercepcionIva: true,
      alicuotaPercepcionIva: 3,
      alicuotaPercepcionIibb: 0,
    });
    expect(r.percepcionIva).toBe(0);
  });

  it('totalFinal = subtotalFCA + subtotalRemito + percepcionIva + percepcionIibb', () => {
    const r = calculateOrder('MITAD', [makeItem({ code: '601', quantity: 4 })], lookup, conAmbas);
    const expected = r.subtotalFCA! + r.subtotalRemito! + r.percepcionIva + r.percepcionIibb;
    expect(r.totalFinal).toBeCloseTo(expected, 2);
  });
});

// ─── rebuildFromItems — consistencia con calculateOrder ─────────────────────

describe('rebuildFromItems — consistencia con calculateOrder', () => {
  const prod = makeProduct({ codigo: '601', precioBulto: 500 });
  const lookup = makeLookup([prod]);
  const ctx: CalculationContext = {
    aplicaPercepcionIva: true,
    alicuotaPercepcionIva: 3,
    alicuotaPercepcionIibb: 0,
  };

  it('FC_A: rebuildFromItems produce los mismos totales', () => {
    const r1 = calculateOrder('FC_A', [makeItem({ code: '601', quantity: 3 })], lookup, ctx);
    const r2 = rebuildFromItems('FC_A', r1.items, ctx);
    expect(r2.subtotalNeto).toBeCloseTo(r1.subtotalNeto, 2);
    expect(r2.ivaTotal).toBeCloseTo(r1.ivaTotal, 2);
    expect(r2.percepcionIva).toBeCloseTo(r1.percepcionIva, 2);
    expect(r2.totalFinal).toBeCloseTo(r1.totalFinal, 2);
  });

  it('MITAD: rebuildFromItems produce los mismos totales', () => {
    const r1 = calculateOrder('MITAD', [makeItem({ code: '601', quantity: 4 })], lookup, ctx);
    const r2 = rebuildFromItems('MITAD', r1.items, ctx);
    expect(r2.percepcionIva).toBeCloseTo(r1.percepcionIva, 2);
    expect(r2.totalFinal).toBeCloseTo(r1.totalFinal, 2);
  });

  it('Z: rebuildFromItems devuelve percepcion=0', () => {
    const r1 = calculateOrder('Z', [makeItem({ code: '601', quantity: 2 })], lookup, ctx);
    const r2 = rebuildFromItems('Z', r1.items, ctx);
    expect(r2.percepcionIva).toBe(0);
    expect(r2.totalFinal).toBeCloseTo(r1.totalFinal, 2);
  });
});

// ─── Múltiples productos: mezcla encontrado / no encontrado ──────────────────

describe('mezcla de productos encontrados y no encontrados', () => {
  const p1 = makeProduct({ codigo: '100', precioBulto: 200 });
  const p2 = makeProduct({ codigo: '200', precioBulto: 300 });
  const lookup = makeLookup([p1, p2]);

  it('FC_A: notFound no suma al neto ni al total', () => {
    const r = calculateOrder(
      'FC_A',
      [makeItem({ code: '100', quantity: 2 }), makeItem({ code: '999', quantity: 5 })],
      lookup,
      noPercepcion,
    );
    expect(r.items.find((i) => i.codigo === '999')!.notFound).toBe(true);
    expect(r.subtotalNeto).toBeCloseTo((2 * 200) / 1.21, 2);
    expect(r.totalFinal).toBeCloseTo(2 * 200, 2);
  });

  it('MITAD: notFound genera placeholders en groupFCA o groupRemito según cantidad', () => {
    const r = calculateOrder(
      'MITAD',
      [makeItem({ code: '999', quantity: 4 })],
      lookup,
      noPercepcion,
    );
    const notFoundFCA = r.groupFCA!.find((i) => i.codigo === '999');
    const notFoundRem = r.groupRemito!.find((i) => i.codigo === '999');
    expect(notFoundFCA?.notFound).toBe(true);
    expect(notFoundRem?.notFound).toBe(true);
  });
});

// ─── Bonificaciones en FC_A ───────────────────────────────────────────────────

describe('bonificaciones en modo FC_A', () => {
  const p = makeProduct({ codigo: '605', precioBulto: 300 });
  const lookup = makeLookup([p]);

  it('FC_A cobra solo la cantidad pagada, no la bonificada', () => {
    const r = calculateOrder('FC_A', [makeItem({ code: '605', quantity: 10, cantidadBonificada: 2 })], lookup, noPercepcion);
    expect(r.items[0].total).toBeCloseTo(10 * 300, 2);
    expect(r.items[0].cantidadBonificada).toBe(2);
  });

  it('FC_A: neto calculado sobre cantidad pagada (sin bonificada)', () => {
    const r = calculateOrder('FC_A', [makeItem({ code: '605', quantity: 10, cantidadBonificada: 2 })], lookup, noPercepcion);
    expect(r.items[0].neto).toBeCloseTo((10 * 300) / 1.21, 2);
  });
});
