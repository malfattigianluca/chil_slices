/**
 * Calcula la distancia de edición (Levenshtein) entre dos strings.
 * Implementación iterativa O(m*n) con dos filas en memoria.
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,       // borrado
        curr[j - 1] + 1,   // inserción
        prev[j - 1] + cost, // sustitución
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[b.length];
}

/**
 * Normaliza un string para comparaciones fuzzy:
 * minúsculas, sin acentos, sin espacios extra.
 */
export function normalizeForFuzzy(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quitar diacríticos
    .replace(/\s+/g, ' ')
    .trim();
}
