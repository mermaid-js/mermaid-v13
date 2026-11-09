/**
 * The block layout's invariants (R-LAYOUT-3, spec #521 §Testing): what every layout must
 * satisfy. Empty when they hold; otherwise one line per violation. The conformance sweep runs
 * them over the parser-produced corpus, the layout specs over the edge cases.
 *
 * - no number is NaN or infinite;
 * - siblings never overlap (their boxes: the outline's, a space's cell);
 * - a child that does not overflow its composite's grid is inside the composite. A child
 *   overflows where v12's grid has no room for it: its columns run past the grid's `xSize`
 *   (`columns` when set and below the total span, else the child count), counting columns as
 *   v12's placement does (a block wider than the rest of its row takes only the rest);
 * - each edge starts on its start block's outline and ends on its end block's;
 * - everything drawn is inside `bounds`.
 */
import { outlineDistance } from '../shapes/outline.ts';
import { drawnBoxes } from './layout.ts';
import type { BlockLayout, BlockNodeLayout, Rect } from './types.ts';

const EPS = 1e-6;

/** Every number in `value`, with its path. */
function* numbers(value: unknown, path: string): Generator<[string, number]> {
  if (typeof value === 'number') yield [path, value];
  else if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) yield* numbers(value[i], `${path}[${i}]`);
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) yield* numbers(v, `${path}.${k}`);
  }
}

const inside = (inner: Rect, outer: Rect, eps: number): boolean =>
  inner.x >= outer.x - eps &&
  inner.y >= outer.y - eps &&
  inner.x + inner.width <= outer.x + outer.width + eps &&
  inner.y + inner.height <= outer.y + outer.height + eps;

const overlaps = (a: Rect, b: Rect, eps: number): boolean =>
  a.x < b.x + b.width - eps &&
  b.x < a.x + a.width - eps &&
  a.y < b.y + b.height - eps &&
  b.y < a.y + a.height - eps;

const printed = (r: Rect): string =>
  `(${r.x.toFixed(2)}, ${r.y.toFixed(2)}, ${r.width.toFixed(2)} × ${r.height.toFixed(2)})`;

/** The violations of `layout`. */
export function blockLayoutViolations(layout: BlockLayout): string[] {
  const out: string[] = [];
  for (const [path, n] of numbers(layout, 'layout')) {
    if (!Number.isFinite(n)) out.push(`${path} is ${n}`);
  }
  if (out.length > 0) return out;
  const b = layout.bounds;
  const eps = EPS * Math.max(1, Math.abs(b.x), Math.abs(b.y), b.width, b.height);

  // Children by parent (-1: the top level), in order.
  const groups = new Map<number, number[]>();
  layout.blocks.forEach((block, i) => {
    const key = block.parent ?? -1;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = []));
    g.push(i);
  });
  for (const [parent, kids] of groups) {
    siblingsApart(layout.blocks, kids, eps, out);
    if (parent >= 0) {
      const p = layout.blocks[parent]!;
      if (p.shape === 'composite') childrenInside(layout.blocks, p, kids, eps, out);
    }
  }
  edgesOnOutlines(layout, eps, out);
  for (const [what, box] of drawnBoxes(layout)) {
    if (!inside(box, layout.bounds, eps)) {
      out.push(`${what} ${printed(box)} is outside the bounds ${printed(layout.bounds)}`);
    }
  }
  return out;
}

/**
 * No two siblings' boxes overlap. The boxes go into buckets of a grid as large as their mean
 * size, and only boxes sharing a bucket are compared, so a long row or column costs one pass.
 */
function siblingsApart(
  blocks: readonly BlockNodeLayout[],
  kids: readonly number[],
  eps: number,
  out: string[]
): void {
  let size = 0;
  for (const i of kids) size += blocks[i]!.box.width + blocks[i]!.box.height;
  size = Math.max(size / (2 * kids.length), eps, 1);
  const buckets = new Map<string, number[]>();
  const seen = new Set<string>();
  // Compares `i` with what its bucket holds, then adds it.
  const meet = (key: string, i: number): void => {
    let bucket = buckets.get(key);
    if (!bucket) buckets.set(key, (bucket = []));
    for (const j of bucket) {
      const pair = `${j},${i}`;
      if (seen.has(pair) || !overlaps(blocks[i]!.box, blocks[j]!.box, eps)) continue;
      seen.add(pair);
      out.push(`siblings ${blocks[j]!.id} and ${blocks[i]!.id} overlap`);
    }
    bucket.push(i);
  };
  for (const i of kids) {
    const a = blocks[i]!.box;
    const [cx0, cx1] = [Math.floor(a.x / size), Math.floor((a.x + a.width) / size)];
    const [cy0, cy1] = [Math.floor(a.y / size), Math.floor((a.y + a.height) / size)];
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) meet(`${cx},${cy}`, i);
    }
  }
}

/** Each child that fits v12's grid is inside its composite. */
function childrenInside(
  blocks: readonly BlockNodeLayout[],
  parent: BlockNodeLayout,
  kids: readonly number[],
  eps: number,
  out: string[]
): void {
  const columns = parent.columns ?? -1;
  let total = 0;
  for (const i of kids) total += blocks[i]!.span;
  const xSize = columns > 0 && columns < total ? columns : kids.length;
  let pos = 0;
  for (const i of kids) {
    const child = blocks[i]!;
    const column = columns > 0 ? pos % columns : pos;
    if (column + child.span <= xSize && !inside(child.box, parent.box, eps)) {
      out.push(
        `${child.id} ${printed(child.box)} is outside its composite ${parent.id} ${printed(parent.box)}`
      );
    }
    pos += columns > 0 ? Math.min(child.span, columns - (pos % columns)) : child.span;
  }
}

/** Each edge's first point on its start's outline, its last on its end's. */
function edgesOnOutlines(layout: BlockLayout, eps: number, out: string[]): void {
  const byId = new Map<string, BlockNodeLayout>();
  for (const b of layout.blocks) if (b.shape !== 'space' && !byId.has(b.id)) byId.set(b.id, b);
  for (const e of layout.edges) {
    const ends: [string, BlockNodeLayout | undefined, number][] = [
      ['starts', byId.get(e.start), 0],
      ['ends', byId.get(e.end), e.points.length - 1],
    ];
    for (const [what, block, at] of ends) {
      const p = e.points[at];
      if (!block?.outline || !p) {
        out.push(`edge ${e.id} ${what} on no block`);
        continue;
      }
      const d = outlineDistance(block.outline, {
        x: p.x - block.centre.x,
        y: p.y - block.centre.y,
      });
      // The outline's own scale, so a large block's float error is not a violation.
      const tol = eps * Math.max(1, block.box.width, block.box.height) * 10;
      if (d > tol) out.push(`edge ${e.id} ${what} ${d.toFixed(6)} off ${block.id}'s outline`);
    }
  }
}
