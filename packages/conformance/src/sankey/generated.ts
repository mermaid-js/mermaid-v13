/**
 * Generated sankey sources for the layout specs (#499): seeded random DAGs of up to 200 nodes,
 * written as sankey text and parsed by the v13 parser. Each node past the first gets up to
 * three links from earlier nodes (or none, starting a new component), plus a few long skips
 * and repeated rows; values mix integers, decimals, zeros and a wide spread. Rows are shuffled,
 * so the first-appearance order of the nodes is not their topological order.
 */

/** Node counts the specs lay out. */
export const GENERATED_SIZES = [2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 200] as const;
/** Seeds per size. */
export const GENERATED_SEEDS = [1, 2, 3, 4, 5, 6] as const;

/** mulberry32: a small seeded generator in [0, 1). */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A sankey source of `nodes` nodes for `seed`. */
export function generatedSankey(seed: number, nodes: number): string {
  const r = random(seed * 7919 + nodes);
  const pick = (n: number): number => Math.floor(r() * n);
  const value = (): string => {
    const u = r();
    if (u < 0.05) return '0';
    if (u < 0.45) return String(1 + pick(100));
    if (u < 0.75) return (r() * 50).toFixed(2);
    return (10 ** (r() * 7 - 3)).toPrecision(4);
  };
  const rows: string[] = [];
  for (let j = 1; j < nodes; j++) {
    const count = r() < 0.1 ? 0 : 1 + pick(3);
    const from = new Set<number>();
    for (let k = 0; k < count; k++) from.add(pick(j));
    // A node with no link would not exist: give it one out of the last node instead.
    if (from.size === 0) {
      rows.push(`n${j},n${pick(j)}x${j},${value()}`);
      continue;
    }
    for (const i of from) rows.push(`n${i},n${j},${value()}`);
  }
  // Long skips and repeated rows.
  for (let k = 0; k < nodes / 10; k++) {
    const i = pick(Math.max(1, nodes - 1));
    const j = i + 1 + pick(nodes - 1 - i || 1);
    if (j < nodes) rows.push(`n${i},n${j},${value()}`);
  }
  for (let k = 0; k < nodes / 20 && rows.length > 0; k++) rows.push(rows[pick(rows.length)]!);
  for (let i = rows.length - 1; i > 0; i--) {
    const j = pick(i + 1);
    [rows[i], rows[j]] = [rows[j]!, rows[i]!];
  }
  return `sankey\n${rows.join('\n')}\n`;
}
