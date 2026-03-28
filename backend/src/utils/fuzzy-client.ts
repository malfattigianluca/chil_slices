import { levenshteinDistance, normalizeForFuzzy } from './levenshtein';

export interface ClientCandidate {
  id: number;
  codigo: string;
  nombre: string;
}

export type MatchConfidence = 'exact' | 'high' | 'low' | 'none';

export interface FuzzyMatch {
  client: ClientCandidate;
  score: number;          // distancia de edición (menor = mejor)
  confidence: MatchConfidence;
  matchedBy: 'codigo' | 'nombre' | 'prefix';
}

/**
 * Umbrales de confianza:
 *   exact  → score 0 (match exacto normalizado)
 *   high   → score 1-2 (typo menor, match automático con advertencia suave)
 *   low    → score 3+  (dudoso, requiere confirmación del usuario)
 */
const THRESHOLD_HIGH = 2;
const THRESHOLD_LOW = 4;

function confidenceFromScore(score: number): MatchConfidence {
  if (score === 0) return 'exact';
  if (score <= THRESHOLD_HIGH) return 'high';
  if (score <= THRESHOLD_LOW) return 'low';
  return 'none';
}

/**
 * Busca clientes que coincidan con la query por código exacto, nombre exacto,
 * prefijo de nombre, o distancia de edición tolerable.
 *
 * @param query    Texto ingresado por el vendedor (puede tener typos)
 * @param clients  Lista de clientes contra la que comparar
 * @param maxResults Máximo de resultados a devolver
 */
export function fuzzyMatchClients(
  query: string,
  clients: ClientCandidate[],
  maxResults = 5,
): FuzzyMatch[] {
  if (!query.trim()) return [];

  const normalizedQuery = normalizeForFuzzy(query);
  const results: FuzzyMatch[] = [];

  for (const client of clients) {
    // Intento 1: match exacto de código (case insensitive)
    if (client.codigo.toLowerCase() === query.toLowerCase()) {
      results.push({ client, score: 0, confidence: 'exact', matchedBy: 'codigo' });
      continue;
    }

    const normalizedNombre = normalizeForFuzzy(client.nombre);

    // Intento 2: match exacto de nombre normalizado
    if (normalizedNombre === normalizedQuery) {
      results.push({ client, score: 0, confidence: 'exact', matchedBy: 'nombre' });
      continue;
    }

    // Intento 3: nombre comienza con la query (prefix match)
    if (normalizedNombre.startsWith(normalizedQuery)) {
      results.push({ client, score: 0, confidence: 'exact', matchedBy: 'prefix' });
      continue;
    }

    // Intento 4: la query está contenida en el nombre
    if (normalizedNombre.includes(normalizedQuery)) {
      results.push({ client, score: 1, confidence: 'high', matchedBy: 'nombre' });
      continue;
    }

    // Intento 5: Levenshtein sobre el nombre completo
    const distFull = levenshteinDistance(normalizedQuery, normalizedNombre);

    // Intento 6: Levenshtein sobre cada palabra del nombre
    const words = normalizedNombre.split(' ');
    const distWord = Math.min(...words.map((w) => levenshteinDistance(normalizedQuery, w)));

    const score = Math.min(distFull, distWord);
    const confidence = confidenceFromScore(score);

    if (confidence !== 'none') {
      results.push({ client, score, confidence, matchedBy: 'nombre' });
    }
  }

  // Ordenar: exact primero, luego por score ascendente
  return results
    .sort((a, b) => {
      const order: Record<MatchConfidence, number> = { exact: 0, high: 1, low: 2, none: 3 };
      if (order[a.confidence] !== order[b.confidence]) {
        return order[a.confidence] - order[b.confidence];
      }
      return a.score - b.score;
    })
    .slice(0, maxResults);
}
