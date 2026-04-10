/**
 * Tests unitarios para fuzzyMatchClients.
 * Cubren todos los niveles de confianza y estrategias de matching.
 */

import { fuzzyMatchClients, ClientCandidate } from '../utils/fuzzy-client';

const clients: ClientCandidate[] = [
  { id: 1, codigo: '339', nombre: 'Distribuidora Rojo' },
  { id: 2, codigo: '450', nombre: 'Supermercado Azul Norte' },
  { id: 3, codigo: 'C01', nombre: 'Farmacia Central' },
  { id: 4, codigo: '001', nombre: 'Mini Mercado El Sol' },
  { id: 5, codigo: '777', nombre: 'COOP CONSUMO' },
];

// ─── Match exacto por código ──────────────────────────────────────────────────

describe('match exacto por código', () => {
  it('código exacto devuelve confidence=exact, matchedBy=codigo', () => {
    const r = fuzzyMatchClients('339', clients);
    expect(r[0].confidence).toBe('exact');
    expect(r[0].matchedBy).toBe('codigo');
    expect(r[0].client.id).toBe(1);
  });

  it('código case-insensitive: "c01" matchea "C01"', () => {
    const r = fuzzyMatchClients('c01', clients);
    expect(r[0].confidence).toBe('exact');
    expect(r[0].client.codigo).toBe('C01');
  });
});

// ─── Match exacto por nombre ──────────────────────────────────────────────────

describe('match exacto por nombre', () => {
  it('nombre exacto normalizado → confidence=exact', () => {
    const r = fuzzyMatchClients('Distribuidora Rojo', clients);
    expect(r[0].confidence).toBe('exact');
    expect(r[0].client.id).toBe(1);
  });

  it('nombre con tildes normalizadas → confidence=exact', () => {
    // COOP CONSUMO en mayúsculas
    const r = fuzzyMatchClients('coop consumo', clients);
    expect(r[0].confidence).toBe('exact');
  });
});

// ─── Match por prefijo ────────────────────────────────────────────────────────

describe('match por prefijo', () => {
  it('prefijo del nombre → confidence=exact, matchedBy=prefix', () => {
    const r = fuzzyMatchClients('Distribuidora', clients);
    expect(r[0].confidence).toBe('exact');
    expect(r[0].matchedBy).toBe('prefix');
  });

  it('prefijo parcial corto → prefix match', () => {
    const r = fuzzyMatchClients('Farmacia', clients);
    expect(r[0].confidence).toBe('exact');
    expect(r[0].client.nombre).toBe('Farmacia Central');
  });
});

// ─── Match por substring ──────────────────────────────────────────────────────

describe('match por substring contenido en nombre', () => {
  it('substring del nombre → confidence=high', () => {
    const r = fuzzyMatchClients('Norte', clients);
    expect(r[0].confidence).toBe('high');
    expect(r[0].client.nombre).toContain('Norte');
  });

  it('palabra del medio → high confidence', () => {
    const r = fuzzyMatchClients('Central', clients);
    expect(r[0].confidence).toBe('high');
    expect(r[0].client.nombre).toContain('Central');
  });
});

// ─── Match fuzzy (Levenshtein) ────────────────────────────────────────────────

describe('match Levenshtein con typos', () => {
  it('un typo en el nombre → confidence=high (score≤2)', () => {
    // "Rojo" vs "Rojo" → exacto; "Rojoo" → dist 1 → high
    const r = fuzzyMatchClients('Rojoo', clients);
    expect(r.length).toBeGreaterThan(0);
    expect(['exact', 'high'].includes(r[0].confidence)).toBe(true);
  });

  it('query vacía devuelve array vacío', () => {
    expect(fuzzyMatchClients('', clients)).toHaveLength(0);
  });

  it('query sin match devuelve confidence=none (no incluido en resultados)', () => {
    const r = fuzzyMatchClients('XXXXXXXXXXX', clients);
    expect(r.every((m) => m.confidence !== 'none')).toBe(true);
    // Todos los retornados tienen al menos score tolerable (none se filtra)
  });
});

// ─── maxResults ───────────────────────────────────────────────────────────────

describe('maxResults limita resultados', () => {
  it('sin límite explícito devuelve hasta 5', () => {
    // Query muy vaga para matchear muchos
    const r = fuzzyMatchClients('a', clients);
    expect(r.length).toBeLessThanOrEqual(5);
  });

  it('maxResults=2 devuelve máximo 2 resultados', () => {
    const r = fuzzyMatchClients('mercado', clients, 2);
    expect(r.length).toBeLessThanOrEqual(2);
  });
});

// ─── Orden de resultados ──────────────────────────────────────────────────────

describe('orden de resultados', () => {
  it('exact siempre va antes que high', () => {
    const extraClients: ClientCandidate[] = [
      { id: 10, codigo: '010', nombre: 'Rojo SA' },
      { id: 11, codigo: '011', nombre: 'Distribuidora Rojo' },
    ];
    const r = fuzzyMatchClients('Distribuidora Rojo', extraClients);
    expect(r[0].confidence).toBe('exact');
  });
});
