const allowed = new Set([
  'player',
  'username',
  'nickname',
  'giftName',
  'giftCount',
  'likeCount',
  'totalLikes',
]);

/** User values are single literal tokens: no selectors, quotes, slash, whitespace or syntax delimiters. */
export function renderTemplate(
  template: string,
  variables: Record<string, string | number>,
  destination: 'command' | 'text' = 'command',
): string {
  const rendered = template.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_, key: string) => {
    if (!allowed.has(key)) throw new Error(`Variable desconocida: ${key}`);
    const value = String(variables[key] ?? '');
    if (key === 'player' && !/^[A-Za-z0-9_]{1,16}$/.test(value))
      throw new Error('Nombre de jugador inválido');
    if (destination === 'text') return value.replace(/[\r\n\0]/g, ' ').slice(0, 200);
    return (
      value
        .normalize('NFKC')
        .replace(/[^\p{L}\p{N}_.-]/gu, '_')
        .slice(0, 100) || 'unknown'
    );
  });
  if (rendered.includes('{{') || rendered.includes('}}')) throw new Error('Plantilla incompleta');
  if (destination === 'command' && /[\r\n\0]/.test(rendered)) throw new Error('Comando multilínea rechazado');
  return destination === 'command' ? rendered.replace(/^\//, '') : rendered;
}

export function seededRandom(seed: string): () => number {
  let state = 2166136261;
  for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function weightedChoice<T extends { weight: number }>(entries: T[], random = Math.random): T {
  if (!entries.length || entries.some((e) => !Number.isFinite(e.weight) || e.weight <= 0))
    throw new Error('Pesos inválidos');
  const total = entries.reduce((sum, e) => sum + e.weight, 0);
  let target = random() * total;
  for (const entry of entries) {
    target -= entry.weight;
    if (target < 0) return entry;
  }
  return entries[entries.length - 1]!;
}
