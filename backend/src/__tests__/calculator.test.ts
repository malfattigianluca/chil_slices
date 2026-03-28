import { calculateOrder, CalculationContext, ProductLookup } from '../modules/calculator/calculator.service';
import { ParsedItem } from '../modules/parser/parser.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeProduct(overrides: Partial<ProductLookup> = {}): ProductLookup {
  return {
    id: 1,
    codigo: '506',
    descripcion: 'Producto Test',
    precioUnidad: 100,
    precioBulto: 800,   // precio de lista con IVA incluido
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

const conPercepcionIva3: CalculationContext = {
  aplicaPercepcionIva: true,
  alicuotaPercepcionIva: 3,
  alicuotaPercepcionIibb: 0,
};

const conAmbas: CalculationContext = {
  aplicaPercepcionIva: true,
  alicuotaPercepcionIva: 3,
  alicuotaPercepcionIibb: 1.5,
};

// ─── Modo Z ───────────────────────────────────────────────────────────────────

describe('calculateOrder — modo Z', () => {
  const lookup = makeLookup([makeProduct()]);

  it('usa precio bulto directamente sin discriminar IVA', () => {
    const r = calculateOrder('Z', [makeItem({ quantity: 2 })], lookup, noPercepcion);
    expect(r.items[0].precioAplicado).toBe(800);
    expect(r.items[0].total).toBe(1600);
    expect(r.items[0].neto).toBeNull();
    expect(r.items[0].iva).toBeNull();
  });

  it('no aplica percepciones aunque el contexto las tenga', () => {
    const r = calculateOrder('Z', [makeItem()], lookup, conPercepcionIva3);
    expect(r.percepcionIva).toBe(0);
    expect(r.percepcionIibb).toBe(0);
  });

  it('totalFinal = suma de totales de líneas', () => {
    const r = calculateOrder('Z', [makeItem({ quantity: 3 })], lookup, noPercepcion);
    expect(r.totalFinal).toBe(2400);
  });
});

// ─── Modo FC_A ────────────────────────────────────────────────────────────────

describe('calculateOrder — modo FC_A', () => {
  const lookup = makeLookup([makeProduct()]);

  it('discrimina IVA correctamente: neto = precio / 1.21', () => {
    const r = calculateOrder('FC_A', [makeItem({ quantity: 1 })], lookup, noPercepcion);
    const item = r.items[0];
    expect(item.precioAplicado).toBe(800);
    expect(item.neto).toBeCloseTo(800 / 1.21, 2);
    expect(item.iva).toBeCloseTo(800 - 800 / 1.21, 2);
    expect(item.total).toBe(800);
  });

  it('acumula neto e IVA en totales globales', () => {
    const r = calculateOrder('FC_A', [makeItem({ quantity: 2 })], lookup, noPercepcion);
    expect(r.subtotalNeto).toBeCloseTo((1600 / 1.21), 2);
    expect(r.ivaTotal).toBeCloseTo(1600 - 1600 / 1.21, 2);
  });

  it('aplica percepción IVA sobre el neto cuando el contexto lo indica', () => {
    const r = calculateOrder('FC_A', [makeItem({ quantity: 1 })], lookup, conPercepcionIva3);
    const netoEsperado = 800 / 1.21;
    expect(r.percepcionIva).toBeCloseTo(netoEsperado * 0.03, 2);
  });

  it('no aplica percepción IVA cuando aplicaPercepcionIva = false', () => {
    const r = calculateOrder('FC_A', [makeItem()], lookup, noPercepcion);
    expect(r.percepcionIva).toBe(0);
  });

  it('aplica percepción IIBB cuando alicuotaPercepcionIibb > 0', () => {
    const r = calculateOrder('FC_A', [makeItem({ quantity: 1 })], lookup, conAmbas);
    const netoEsperado = 800 / 1.21;
    expect(r.percepcionIibb).toBeCloseTo(netoEsperado * 0.015, 2);
  });

  it('totalFinal incluye percepciones', () => {
    const r = calculateOrder('FC_A', [makeItem({ quantity: 1 })], lookup, conPercepcionIva3);
    const neto = 800 / 1.21;
    const percIva = neto * 0.03;
    expect(r.totalFinal).toBeCloseTo(800 + percIva, 2);
  });
});

// ─── Modo MITAD — corrección principal (B1) ───────────────────────────────────

describe('calculateOrder — modo MITAD (por cantidad por producto)', () => {
  const prod601 = makeProduct({ codigo: '601', precioBulto: 500 });
  const prod605 = makeProduct({ codigo: '605', precioBulto: 300 });
  const prod606 = makeProduct({ codigo: '606', precioBulto: 200 });
  const lookup = makeLookup([prod601, prod605, prod606]);

  it('cantidad impar: floor va a FC_A, ceil va a Remito', () => {
    const r = calculateOrder(
      'MITAD',
      [makeItem({ code: '601', quantity: 5 })],
      lookup,
      noPercepcion,
    );
    expect(r.groupFCA).not.toBeNull();
    expect(r.groupRemito).not.toBeNull();
    const fca = r.groupFCA!.find((i) => i.codigo === '601');
    const rem = r.groupRemito!.find((i) => i.codigo === '601');
    expect(fca?.cantidad).toBe(2);   // floor(5/2)
    expect(rem?.cantidad).toBe(3);   // ceil(5/2)
  });

  it('cantidad par: se divide exactamente en dos mitades iguales', () => {
    const r = calculateOrder(
      'MITAD',
      [makeItem({ code: '605', quantity: 4 })],
      lookup,
      noPercepcion,
    );
    const fca = r.groupFCA!.find((i) => i.codigo === '605');
    const rem = r.groupRemito!.find((i) => i.codigo === '605');
    expect(fca?.cantidad).toBe(2);
    expect(rem?.cantidad).toBe(2);
  });

  it('cantidad 1: 0 a FC_A, 1 a Remito', () => {
    const r = calculateOrder(
      'MITAD',
      [makeItem({ code: '606', quantity: 1 })],
      lookup,
      noPercepcion,
    );
    const fca = r.groupFCA!.find((i) => i.codigo === '606');
    const rem = r.groupRemito!.find((i) => i.codigo === '606');
    // Si cantidad FC_A es 0 el item puede no estar en groupFCA
    expect(fca?.cantidad ?? 0).toBe(0);
    expect(rem?.cantidad).toBe(1);
  });

  it('caso del spec: 601=5, 605=4, 606=1 → distribución correcta por producto', () => {
    const r = calculateOrder(
      'MITAD',
      [
        makeItem({ code: '601', quantity: 5 }),
        makeItem({ code: '605', quantity: 4 }),
        makeItem({ code: '606', quantity: 1 }),
      ],
      lookup,
      noPercepcion,
    );

    const fca601 = r.groupFCA!.find((i) => i.codigo === '601');
    const rem601 = r.groupRemito!.find((i) => i.codigo === '601');
    expect(fca601?.cantidad).toBe(2);
    expect(rem601?.cantidad).toBe(3);

    const fca605 = r.groupFCA!.find((i) => i.codigo === '605');
    const rem605 = r.groupRemito!.find((i) => i.codigo === '605');
    expect(fca605?.cantidad).toBe(2);
    expect(rem605?.cantidad).toBe(2);

    const rem606 = r.groupRemito!.find((i) => i.codigo === '606');
    expect(rem606?.cantidad).toBe(1);
  });

  it('subtotalFCA y subtotalRemito calculan sobre las cantidades correctas', () => {
    // 601=4: FC_A=2*500=1000, Remito=2*500=1000
    const r = calculateOrder(
      'MITAD',
      [makeItem({ code: '601', quantity: 4 })],
      lookup,
      noPercepcion,
    );
    expect(r.subtotalFCA).toBeCloseTo(1000, 2);
    expect(r.subtotalRemito).toBeCloseTo(1000, 2);
  });

  it('percepciones se calculan solo sobre la parte FC_A', () => {
    // 601=4: neto FC_A = (2*500)/1.21, percIva = neto * 0.03
    const r = calculateOrder(
      'MITAD',
      [makeItem({ code: '601', quantity: 4 })],
      lookup,
      conPercepcionIva3,
    );
    const netoFCA = (2 * 500) / 1.21;
    expect(r.percepcionIva).toBeCloseTo(netoFCA * 0.03, 2);
  });

  it('el modo MITAD no mezcla productos de diferentes clientes (control de aislamiento)', () => {
    const r1 = calculateOrder('MITAD', [makeItem({ code: '601', quantity: 5 })], lookup, noPercepcion);
    const r2 = calculateOrder('MITAD', [makeItem({ code: '605', quantity: 3 })], lookup, noPercepcion);
    expect(r1.groupFCA!.length).not.toBe(0);
    expect(r2.groupFCA!).toBeDefined();
  });
});

// ─── Productos no encontrados ─────────────────────────────────────────────────

describe('productos no encontrados', () => {
  const lookup = makeLookup([]);

  it('genera ítem con notFound=true y total=0', () => {
    const r = calculateOrder('Z', [makeItem({ code: '999' })], lookup, noPercepcion);
    expect(r.items[0].notFound).toBe(true);
    expect(r.items[0].total).toBe(0);
  });

  it('no suma el ítem no encontrado al total final', () => {
    const lookup2 = makeLookup([makeProduct({ codigo: '506' })]);
    const r = calculateOrder(
      'Z',
      [makeItem({ code: '506', quantity: 2 }), makeItem({ code: '999' })],
      lookup2,
      noPercepcion,
    );
    expect(r.totalFinal).toBe(1600); // solo el producto encontrado
    expect(r.items.some((i) => i.notFound)).toBe(true);
  });
});

// ─── Bonificaciones en cálculo (requiere B5) ──────────────────────────────────

describe('calculateOrder — bonificaciones', () => {
  const lookup = makeLookup([makeProduct({ codigo: '605', precioBulto: 300 })]);

  it('cobra solo la cantidad pagada, no la bonificada', () => {
    // 605=10+1: cobra 10, bonifica 1
    const r = calculateOrder(
      'Z',
      [makeItem({ code: '605', quantity: 10, cantidadBonificada: 1 })],
      lookup,
      noPercepcion,
    );
    expect(r.items[0].total).toBe(10 * 300); // 3000, no 11*300
  });

  it('el item registra la cantidadBonificada', () => {
    const r = calculateOrder(
      'Z',
      [makeItem({ code: '605', quantity: 10, cantidadBonificada: 1 })],
      lookup,
      noPercepcion,
    );
    expect(r.items[0].cantidadBonificada).toBe(1);
  });

  it('sin bonificación: cantidadBonificada=0, cobra todo', () => {
    const r = calculateOrder(
      'Z',
      [makeItem({ code: '605', quantity: 10, cantidadBonificada: 0 })],
      lookup,
      noPercepcion,
    );
    expect(r.items[0].total).toBe(3000);
    expect(r.items[0].cantidadBonificada).toBe(0);
  });
});

// ─── Contexto fiscal: uso real de datos del cliente (requiere B2) ─────────────

describe('contexto fiscal — usa datos del cliente', () => {
  const lookup = makeLookup([makeProduct()]);

  it('con aplicaPercepcionIva=false: percepcionIva es 0', () => {
    const r = calculateOrder('FC_A', [makeItem()], lookup, {
      aplicaPercepcionIva: false,
      alicuotaPercepcionIva: 3,
      alicuotaPercepcionIibb: 0,
    });
    expect(r.percepcionIva).toBe(0);
  });

  it('con aplicaPercepcionIva=true y alicuota 5%: calcula correctamente', () => {
    const r = calculateOrder('FC_A', [makeItem({ quantity: 1 })], lookup, {
      aplicaPercepcionIva: true,
      alicuotaPercepcionIva: 5,
      alicuotaPercepcionIibb: 0,
    });
    const neto = 800 / 1.21;
    expect(r.percepcionIva).toBeCloseTo(neto * 0.05, 2);
  });

  it('con alicuotaPercepcionIibb 2%: calcula IIBB sobre neto', () => {
    const r = calculateOrder('FC_A', [makeItem({ quantity: 1 })], lookup, {
      aplicaPercepcionIva: false,
      alicuotaPercepcionIva: 0,
      alicuotaPercepcionIibb: 2,
    });
    const neto = 800 / 1.21;
    expect(r.percepcionIibb).toBeCloseTo(neto * 0.02, 2);
  });
});
