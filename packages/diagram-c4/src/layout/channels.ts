/**
 * The C4 router's last search before a straight line (#774): an orthogonal path through the
 * channels between the shapes, for a relation that no elbow of two bends clears. The lanes run
 * down the middle between each two neighbouring shape edges (and a lane out past the drawing on
 * each side), so every channel between two shapes holds one. The path through them with the
 * least length, bends and crossings of the lines already routed is found with Dijkstra's search.
 * Shapes are their boxes, as the router's other clearance checks read them.
 *
 * Every lane crossing and every step of the search is charged to the router's work budget
 * (R-SEC-5): when it is spent the search stops, and the line goes straight.
 */
import { C4_METRICS as M } from './metrics.ts';
import type { Outline } from './shapes.ts';

/** A place a path may leave or reach a shape: a point on its box, and the way out of the shape. */
export interface Port {
  readonly x: number;
  readonly y: number;
  readonly dx: number;
  readonly dy: number;
}

/** The work counter the search charges (the router's `Work`). */
export interface Budget {
  charge(n: number): void;
  readonly done: boolean;
}

/**
 * The stretches the routes so far take up, as the router's `Lanes` keeps them: upright ones as
 * x, top, bottom; level ones as y, left, right.
 */
export interface Taken {
  readonly upright: readonly number[];
  readonly level: readonly number[];
}

/** A path found: its corners (x, y pairs, from the start port to the end port) and their ports. */
export interface Channel {
  readonly points: number[];
  readonly start: number;
  readonly end: number;
}

/** The four ways, as steps along x and y; a way and its reverse are `d` and `d ^ 1`. */
const WAYS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const wayOf = (dx: number, dy: number): number => WAYS.findIndex(([x, y]) => x === dx && y === dy);

/**
 * The lanes along one axis: the middle between each two neighbouring edges, one lane out past the
 * first and the last edge, and the ports' own lines; sorted, each once.
 */
function lanesOf(edges: number[], ports: readonly number[]): number[] {
  const sorted = [...new Set(edges)].sort((p, q) => p - q);
  const out = new Set<number>(ports);
  if (sorted.length) {
    out.add(sorted[0]! - M.lane);
    out.add(sorted[sorted.length - 1]! + M.lane);
  }
  for (let i = 1; i < sorted.length; i++) out.add((sorted[i - 1]! + sorted[i]!) / 2);
  return [...out].sort((p, q) => p - q);
}

/** The first index in sorted `list` at or past `v` (past it when `past`). */
function lowerBound(list: readonly number[], v: number, past = false): number {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid]! < v || (past && list[mid] === v)) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** A min-heap of search states by cost, ties in the order pushed, so the search is deterministic. */
class Heap {
  private readonly items: [number, number, number][] = [];
  private seq = 0;

  get size(): number {
    return this.items.length;
  }

  push(cost: number, state: number): void {
    const items = this.items;
    items.push([cost, this.seq++, state]);
    let i = items.length - 1;
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (!before(items[i]!, items[up]!)) break;
      [items[i], items[up]] = [items[up]!, items[i]!];
      i = up;
    }
  }

  pop(): [number, number] {
    const items = this.items;
    const top = items[0]!;
    const last = items.pop()!;
    if (items.length) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let least = i;
        if (l < items.length && before(items[l]!, items[least]!)) least = l;
        if (r < items.length && before(items[r]!, items[least]!)) least = r;
        if (least === i) break;
        [items[i], items[least]] = [items[least]!, items[i]!];
        i = least;
      }
    }
    return [top[0], top[2]];
  }
}

const before = (p: readonly number[], q: readonly number[]): boolean =>
  p[0]! < q[0]! || (p[0] === q[0] && p[1]! < q[1]!);

/**
 * The lane grid: which crossings lie on or in a shape's box (the ports excepted), and how many
 * routed lines cross each step down (`down`, from crossing i, j to i, j + 1) and across
 * (`across`, from i, j to i + 1, j), both indexed `i * ys.length + j`.
 */
interface Grid {
  readonly xs: readonly number[];
  readonly ys: readonly number[];
  readonly blocked: Uint8Array;
  readonly down: Uint16Array;
  readonly across: Uint16Array;
}

/**
 * Counts each of `stretches` (at, from, to) across the steps it cuts: a level stretch at y cuts
 * the steps down that pass y between its ends, an upright one the steps across.
 */
function mark(
  count: Uint16Array,
  stretches: readonly number[],
  [along, other]: readonly [readonly number[], readonly number[]],
  index: (i: number, j: number) => number,
  work: Budget
): void {
  work.charge(stretches.length / 3);
  for (let k = 0; k < stretches.length; k += 3) {
    const j = lowerBound(other, stretches[k]!) - 1;
    if (j < 0 || j + 1 >= other.length) continue;
    const i1 = lowerBound(along, stretches[k + 2]!);
    for (let i = lowerBound(along, stretches[k + 1]!, true); i < i1; i++) count[index(i, j)]!++;
  }
}

/** What the grid is built from: the ends' ports, the shapes, and the lines routed so far. */
export interface Ground {
  readonly starts: readonly Port[];
  readonly ends: readonly Port[];
  readonly blocks: readonly Outline[];
  readonly taken: Taken;
}

function gridOf({ starts, ends, blocks, taken }: Ground, work: Budget): Grid | undefined {
  const ports = [...starts, ...ends];
  const xs = lanesOf(
    blocks.flatMap((b) => [b.x, b.x + b.width]),
    ports.map((p) => p.x)
  );
  const ys = lanesOf(
    blocks.flatMap((b) => [b.y, b.y + b.height]),
    ports.map((p) => p.y)
  );
  // The grid is charged before it is built, so a budget too small for it is never overrun.
  work.charge(xs.length * ys.length + blocks.length);
  if (work.done) return undefined;
  const blocked = new Uint8Array(xs.length * ys.length);
  for (const b of blocks) {
    const i1 = lowerBound(xs, b.x + b.width, true);
    const j0 = lowerBound(ys, b.y);
    const j1 = lowerBound(ys, b.y + b.height, true);
    for (let i = lowerBound(xs, b.x); i < i1; i++)
      for (let j = j0; j < j1; j++) blocked[i * ys.length + j] = 1;
  }
  for (const p of ports) blocked[lowerBound(xs, p.x) * ys.length + lowerBound(ys, p.y)] = 0;
  const ny = ys.length;
  const down = new Uint16Array(blocked.length);
  const across = new Uint16Array(blocked.length);
  mark(down, taken.level, [xs, ys], (i, j) => i * ny + j, work);
  mark(across, taken.upright, [ys, xs], (j, i) => i * ny + j, work);
  return { xs, ys, blocked, down, across };
}

/** The grid crossings of the path that ends in `state`, from its first, walked back through `from`. */
function walk(state: number, from: Int32Array): number[] {
  const out: number[] = [];
  for (let s = state; s >= 0; s = from[s]!) out.push(s >> 2);
  return out.reverse();
}

/** The corners of a path through grid crossings `nodes`, as x, y pairs: its ends and its bends. */
function cornersOf(nodes: readonly number[], { xs, ys }: Grid): number[] {
  const at = nodes.map((n) => [xs[Math.floor(n / ys.length)]!, ys[n % ys.length]!] as const);
  const out: number[] = [];
  at.forEach(([x, y], k) => {
    const prev = at[k - 1];
    const next = at[k + 1];
    if (prev && next && ((prev[0] === x && x === next[0]) || (prev[1] === y && y === next[1])))
      return;
    out.push(x, y);
  });
  return out;
}

/** What one step of the search reads: the grid, the best cost to each state, and the way there. */
interface Search {
  readonly grid: Grid;
  readonly best: Float64Array;
  readonly from: Int32Array;
  readonly heap: Heap;
}

/** Steps from `state` (a crossing and the way it was reached) to each open neighbour, not back. */
function relax({ grid, best, from, heap }: Search, state: number, cost: number): void {
  const { xs, ys, blocked, down, across } = grid;
  const ny = ys.length;
  const n = state >> 2;
  const way = state & 3;
  const i = Math.floor(n / ny);
  const j = n % ny;
  WAYS.forEach(([dx, dy], next) => {
    const ni = i + dx;
    const nj = j + dy;
    if (next === (way ^ 1) || ni < 0 || nj < 0 || ni >= xs.length || nj >= ny) return;
    const m = ni * ny + nj;
    if (blocked[m]) return;
    const bend = next === way ? 0 : M.channelBend;
    const cut = dx ? across[Math.min(i, ni) * ny + j]! : down[i * ny + Math.min(j, nj)]!;
    const total =
      cost +
      Math.abs(xs[ni]! - xs[i]!) +
      Math.abs(ys[nj]! - ys[j]!) +
      bend +
      cut * M.channelCrossing;
    const t = m * 4 + next;
    if (total < best[t]!) {
      best[t] = total;
      from[t] = state;
      heap.push(total, t);
    }
  });
}

/**
 * The path with the least length, bends and crossings (each bend costing `M.channelBend`, each
 * crossing of a stretch in `taken` `M.channelCrossing`) from one of `starts` to one of `ends`,
 * along the lanes between `blocks` (the ends' own shapes among them): it leaves a start the way
 * the port faces, and reaches an end against the way its port faces. Undefined when no path is
 * clear, or when the work budget is spent.
 */
export function channelPath(ground: Ground, work: Budget): Channel | undefined {
  const { starts, ends } = ground;
  const grid = gridOf(ground, work);
  if (!grid) return undefined;
  const ny = grid.ys.length;
  const node = (p: Port): number => lowerBound(grid.xs, p.x) * ny + lowerBound(grid.ys, p.y);
  const best = new Float64Array(grid.xs.length * ny * 4).fill(Infinity);
  const search: Search = {
    grid,
    best,
    from: new Int32Array(best.length).fill(-1),
    heap: new Heap(),
  };
  for (const p of starts) {
    const s = node(p) * 4 + wayOf(p.dx, p.dy);
    best[s] = 0;
    search.heap.push(0, s);
  }
  const goal = new Map<number, number>();
  ends.forEach((p, k) => goal.set(node(p) * 4 + wayOf(-p.dx, -p.dy), k));
  while (search.heap.size) {
    work.charge(1);
    if (work.done) return undefined;
    const [cost, state] = search.heap.pop();
    if (cost > best[state]!) continue;
    const end = goal.get(state);
    if (end === undefined) {
      relax(search, state, cost);
      continue;
    }
    const nodes = walk(state, search.from);
    const start = starts.findIndex((p) => node(p) === nodes[0]);
    return { points: cornersOf(nodes, grid), start, end };
  }
  return undefined;
}
