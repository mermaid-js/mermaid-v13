/**
 * Generated treemap models for the layout specs (#485): random forests of up to 500 leaves from
 * a seeded generator, so a failure names a reproducible tree.
 */
import type { TreemapModel, TreemapNode } from '@mermaid-js/diagram-treemap';

/** The leaf counts the specs generate trees of, six seeds each. */
export const GENERATED_SIZES = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 500];
export const GENERATED_SEEDS = [1, 2, 3, 4, 5, 6];

/** The rows of a forest. */
export const count = (rows: readonly TreemapNode[]): number =>
  rows.reduce((n, r) => n + 1 + count(r.children), 0);

/** mulberry32: a small seeded generator, so a failure names a reproducible tree. */
function random(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A random tree of `leaves` leaves: sections nest up to five deep, some empty; values mix ties,
 * zeros, NaN (`.`), decimals and a range of 1 to 1e9, so the tiling meets every row shape;
 * names repeat, and one in ten is long enough to be truncated or hidden.
 */
export function generatedTreemap(seed: number, leaves: number): TreemapModel {
  const rand = random(seed * 7919 + leaves);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
  const scale = pick([1, 10, 1000, 1e9]);
  const value = (): number => {
    const r = rand();
    if (r < 0.05) return 0;
    if (r < 0.07) return Number.NaN;
    if (r < 0.2) return pick([1, 5, 10]);
    if (r < 0.4) return Math.round(rand() * scale * 100) / 100;
    return Math.ceil(rand() ** 3 * scale);
  };
  const long = 'A rather long label 🚀 that needs truncating';
  const name = (prefix: string, k: number): string => (rand() < 0.1 ? long : `${prefix}${id % k}`);
  let n = 0;
  let id = 0;
  const build = (depth: number, size: number): TreemapNode[] => {
    let budget = size;
    const rows: TreemapNode[] = [];
    while (budget > 0 && n < leaves) {
      const astId = `node:g${id++}`;
      if (depth < 5 && rand() < 0.25) {
        const take = 1 + Math.floor(rand() * Math.min(budget, 60));
        const children = rand() < 0.03 ? [] : build(depth + 1, take);
        rows.push({ type: 'Section', name: name('s', 17), depth, children, astId });
        budget -= Math.max(1, take);
      } else {
        rows.push({
          type: 'Leaf',
          name: name('l', 23),
          value: value(),
          depth,
          children: [],
          astId,
        });
        n++;
        budget--;
      }
    }
    return rows;
  };
  const roots: TreemapNode[] = [];
  while (n < leaves) roots.push(...build(0, leaves - n));
  return { roots, classes: [], accTitle: '', accDescr: '', warnings: [] };
}
