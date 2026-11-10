// Stepped edges on the block text grid (D449): an A* over cells with a turn penalty, from a cell
// beside one box to a cell beside the other, in model order, each finished route marked before
// the next. Rules, per cell:
// - leaf boxes, frame corners and frame titles are walls;
// - a frame side may be crossed straight through, at right angles to it, once (pitfall 20: so
//   no end, arrowhead or label ever sits on a frame);
// - another line's cell may be crossed at right angles where both run straight; sharing a run,
//   or touching where either turns or ends, is not allowed;
// - an end is next to its box, outside it, or inside a frame when the edge's other block is in
//   that frame, never on a side's arrow glyph, and the line leaves and enters at right angles to
//   the box. A self-loop leaves one side and comes back into the next one round (`draw.ts`).
// The search is bounded to a window around the two boxes, grown a few times; when no route is
// found the edge is drawn as a plain knee across whatever is there and reported (`ASCII_ROUTE`).
import {
  DOWN,
  DX,
  DY,
  LEFT,
  opposite,
  RIGHT,
  UP,
  type CellRect,
  type Dir,
} from '@mermaid-js/core/ascii';
import type { Point } from '../shapes/outline.ts';
import { BLOCK_TEXT_METRICS } from './metrics.ts';

/** The router's metrics. */
const M = BLOCK_TEXT_METRICS;

/** What a cell holds for the router. */
export const Cell = {
  Free: 0,
  Wall: 1,
  /** A frame's top or bottom side: crossed only up or down. */
  FrameH: 2,
  /** A frame's left or right side: crossed only left or right. */
  FrameV: 3,
} as const;

/** A line's use of a cell. */
export const Use = {
  None: 0,
  /** Straight across. */
  H: 1,
  /** Straight down. */
  V: 2,
  /** A turn, an end, a crossing or a crossed frame: no other line may use it. */
  Taken: 3,
} as const;
export type UseOf = (typeof Use)[keyof typeof Use];

/** One end of an edge: the box, and whether the end is inside it (it holds the other block). */
export interface EndSpec {
  readonly rect: CellRect;
  readonly inside: boolean;
  /** Sides the end may be on (all four when absent). */
  readonly sides?: readonly Dir[];
  /** Border cells an end must not touch (a side's arrow glyph). */
  readonly marks?: ReadonlySet<number>;
}

export interface Route {
  /** The cells in order, from the start's end cell to the end's. */
  readonly cells: readonly Point[];
  /** From the first cell into the start box, and from the last into the end box. */
  readonly startInto: Dir;
  readonly endInto: Dir;
  /** No route was found: a knee drawn across whatever is there. */
  readonly forced: boolean;
}

/**
 * One search's bookkeeping per state (a cell of the search's window × 4 + the direction it was
 * entered in), kept on the board and reused by every search on it, grown to the largest window
 * searched: a state is set in this search when its `stamp` is the search's, so nothing is
 * cleared between searches.
 */
interface Scratch {
  /** The cost to reach the state. */
  g: Float64Array;
  /** The state it was reached from (-1 at a start), and the start cell it came from. */
  from: Int32Array;
  origin: Int32Array;
  stamp: Uint32Array;
  generation: number;
}

/** The router's board: cell kinds, line uses and which line owns each cell. */
export class Board {
  readonly kind: Uint8Array;
  readonly use: Uint8Array;
  /** The edge index + 1 that uses a cell, -1 where two lines cross, 0 for none. */
  readonly owner: Int32Array;
  private scratch?: Scratch;

  constructor(
    readonly width: number,
    readonly height: number
  ) {
    this.kind = new Uint8Array(width * height);
    this.use = new Uint8Array(width * height);
    this.owner = new Int32Array(width * height);
  }

  at(x: number, y: number): number {
    return y * this.width + x;
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  /** The search bookkeeping for `cells` cells, fresh for each search. */
  search(cells: number): Scratch {
    const n = cells * 4;
    const old = this.scratch;
    if (!old || old.stamp.length < n) {
      this.scratch = {
        g: new Float64Array(n),
        from: new Int32Array(n),
        origin: new Int32Array(n),
        stamp: new Uint32Array(n),
        generation: 0,
      };
    }
    const scratch = this.scratch!;
    scratch.generation++;
    return scratch;
  }

  /** Whether nothing is on cell `i`: no box, frame or line. */
  empty(i: number): boolean {
    return this.kind[i] === Cell.Free && this.use[i] === Use.None;
  }

  /** Whether cell `i` is edge `edge`'s alone, run straight as `use` says (across or down). */
  runOf(i: number, edge: number, use: UseOf): boolean {
    return this.owner[i] === edge + 1 && this.use[i] === use;
  }

  /** Marks a leaf box, border included, as a wall. */
  wall(r: CellRect): void {
    for (let y = r.y; y < r.y + r.height; y++)
      for (let x = r.x; x < r.x + r.width; x++) this.kind[this.at(x, y)] = Cell.Wall;
  }

  /** Marks a frame: its sides crossable, corners and `title` cells walls. */
  frame(r: CellRect, title?: { readonly x: number; readonly width: number }): void {
    const right = r.x + r.width - 1;
    const bottom = r.y + r.height - 1;
    for (let x = r.x; x <= right; x++) {
      this.kind[this.at(x, r.y)] = Cell.FrameH;
      this.kind[this.at(x, bottom)] = Cell.FrameH;
    }
    for (let y = r.y; y <= bottom; y++) {
      this.kind[this.at(r.x, y)] = Cell.FrameV;
      this.kind[this.at(right, y)] = Cell.FrameV;
    }
    for (const [x, y] of [
      [r.x, r.y],
      [right, r.y],
      [r.x, bottom],
      [right, bottom],
    ] as const)
      this.kind[this.at(x, y)] = Cell.Wall;
    if (title)
      for (let x = title.x; x < title.x + title.width; x++) this.kind[this.at(x, r.y)] = Cell.Wall;
  }
}

/**
 * The cells an end may be on, with the direction from each into its box; with `open`, as on an
 * empty board (what a forced route falls back to when every port is taken).
 */
function ports(board: Board, end: EndSpec, open = false): Map<number, Dir> {
  const out = new Map<number, Dir>();
  const { rect: r, inside } = end;
  const right = r.x + r.width - 1;
  const bottom = r.y + r.height - 1;
  const sides = end.sides ?? [UP, RIGHT, DOWN, LEFT];
  const add = (bx: number, by: number, side: Dir): void => {
    if (end.marks?.has(board.at(bx, by))) return;
    // Outside: one step out of the border; inside: one step in. `into` points at the border.
    const step = inside ? opposite(side) : side;
    const x = bx + DX[step];
    const y = by + DY[step];
    if (!board.inside(x, y)) return;
    const i = board.at(x, y);
    if (!open && !board.empty(i)) return;
    out.set(i, opposite(step));
  };
  for (const side of sides) {
    if (side === UP || side === DOWN)
      for (let x = r.x + 1; x < right; x++) add(x, side === UP ? r.y : bottom, side);
    else for (let y = r.y + 1; y < bottom; y++) add(side === LEFT ? r.x : right, y, side);
  }
  return out;
}

/**
 * How far a port is from the middle of its side, as a cost under one cell: of two routes
 * equally long, the one that meets its boxes nearer the middle of their sides wins.
 */
function offMiddle(r: CellRect, x: number, y: number): number {
  const midX = r.x + (r.width - 1) / 2;
  const midY = r.y + (r.height - 1) / 2;
  const across = x > r.x && x < r.x + r.width - 1;
  return M.offMiddle * (across ? Math.abs(x - midX) : Math.abs(y - midY));
}

/** A binary min-heap of (cost, state). */
class Heap {
  private readonly f: number[] = [];
  private readonly s: number[] = [];
  get size(): number {
    return this.f.length;
  }
  push(f: number, s: number): void {
    const a = this.f;
    const b = this.s;
    let i = a.length;
    a.push(f);
    b.push(s);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p]! <= f) break;
      a[i] = a[p]!;
      b[i] = b[p]!;
      i = p;
    }
    a[i] = f;
    b[i] = s;
  }
  pop(): number {
    const a = this.f;
    const b = this.s;
    const top = b[0]!;
    const f = a.pop()!;
    const s = b.pop()!;
    const n = a.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && a[c + 1]! < a[c]!) c++;
        if (a[c]! >= f) break;
        a[i] = a[c]!;
        b[i] = b[c]!;
        i = c;
      }
      a[i] = f;
      b[i] = s;
    }
    return top;
  }
}

interface Window {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

function windowOf(board: Board, a: CellRect, b: CellRect, margin: number): Window {
  const m = Number.isFinite(margin) ? margin : Math.max(board.width, board.height);
  return {
    x0: Math.max(0, Math.min(a.x, b.x) - m),
    y0: Math.max(0, Math.min(a.y, b.y) - m),
    x1: Math.min(board.width - 1, Math.max(a.x + a.width, b.x + b.width) + m),
    y1: Math.min(board.height - 1, Math.max(a.y + a.height, b.y + b.height) + m),
  };
}

/** One search: from `starts` to `goals` inside `win`. */
interface Search {
  readonly starts: Map<number, Dir>;
  readonly goals: Map<number, Dir>;
  readonly startRect: CellRect;
  readonly goalRect: CellRect;
  readonly win: Window;
  /** Lines leave and enter their boxes at right angles. */
  readonly strict: boolean;
}

/**
 * The cost of one step in direction `d` from a cell the line reached going `dir`, onto cell
 * (`nx`, `ny`); undefined where the rules forbid it.
 */
function stepCost(board: Board, q: Search, d: Dir, dir: Dir, nx: number, ny: number) {
  const n = board.at(nx, ny);
  const kind = board.kind[n]!;
  const vertical = d === UP || d === DOWN;
  if (kind === Cell.Wall) return undefined;
  if (kind === Cell.FrameH && !vertical) return undefined;
  if (kind === Cell.FrameV && vertical) return undefined;
  const use = board.use[n]!;
  if (use === Use.Taken) return undefined;
  // Another line is crossed at right angles, on a free cell, and never at an end.
  if (use !== Use.None && (kind !== Cell.Free || (use === Use.H) !== vertical)) return undefined;
  if (use !== Use.None && q.goals.has(n)) return undefined;
  let step = 1;
  if (d !== dir) step += M.turn;
  if (kind !== Cell.Free) step += M.frame;
  if (use !== Use.None) step += M.cross;
  if (q.goals.has(n)) step += offMiddle(q.goalRect, nx, ny);
  return step;
}

/**
 * A route's cells, or why there is none: `clipped` when the search met the window's edge (a
 * larger window may find one), `exhausted` when it ran out of states inside it (none will).
 */
type Found = { readonly cells: number[] } | 'clipped' | 'exhausted';

function search(board: Board, q: Search): Found {
  const { width } = board;
  const { win } = q;
  // States are numbered within the window: (x − x0) + (y − y0) · ww, times 4, plus the direction.
  const ww = win.x1 - win.x0 + 1;
  const { g, from, origin, stamp, generation } = board.search(ww * (win.y1 - win.y0 + 1));
  const local = (x: number, y: number): number => x - win.x0 + (y - win.y0) * ww;
  const cellOf = (l: number): number => {
    const lx = l % ww;
    return board.at(win.x0 + lx, win.y0 + (l - lx) / ww);
  };
  const heap = new Heap();
  const { goalRect: r } = q;
  const h = (x: number, y: number): number =>
    Math.max(0, r.x - 1 - x, x - r.x - r.width) + Math.max(0, r.y - 1 - y, y - r.y - r.height);
  for (const [i, into] of q.starts) {
    const x = i % width;
    const y = (i - x) / width;
    const state = local(x, y) * 4 + opposite(into);
    const bias = offMiddle(q.startRect, x, y);
    stamp[state] = generation;
    g[state] = bias;
    from[state] = -1;
    origin[state] = i;
    heap.push(bias + h(x, y), state);
  }
  let clipped = false;
  let expanded = 0;
  while (heap.size > 0) {
    const state = heap.pop();
    const cost = g[state]!;
    const i = cellOf(state >> 2);
    const dir = (state & 3) as Dir;
    const start = origin[state]!;
    // An end is entered at right angles to its box (when strict).
    const into = q.goals.get(i);
    if (i !== start && into !== undefined && (!q.strict || into === dir)) {
      const cells: number[] = [];
      for (let s = state; s >= 0; s = from[s]!) cells.push(cellOf(s >> 2));
      return { cells: cells.reverse() };
    }
    if (++expanded > M.maxSearch) return 'clipped';
    const x = i % width;
    const y = (i - x) / width;
    // Out of the start at right angles to its box (when strict), and through a frame or a
    // crossing, straight on only.
    const straight = (q.strict && i === start) || !board.empty(i);
    for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
      if (d === opposite(dir) || (straight && d !== dir)) continue;
      const nx = x + DX[d];
      const ny = y + DY[d];
      if (nx < win.x0 || ny < win.y0 || nx > win.x1 || ny > win.y1) {
        clipped ||= board.inside(nx, ny);
        continue;
      }
      const step = stepCost(board, q, d, dir, nx, ny);
      if (step === undefined) continue;
      const next = local(nx, ny) * 4 + d;
      const ng = cost + step;
      if (stamp[next] === generation && g[next]! <= ng) continue;
      stamp[next] = generation;
      g[next] = ng;
      from[next] = state;
      origin[next] = start;
      heap.push(ng + h(nx, ny), next);
    }
  }
  return clipped ? 'clipped' : 'exhausted';
}

/** Records a route's cells on the board for the routes after it. */
function mark(board: Board, cells: readonly number[], edge: number): void {
  cells.forEach((i, k) => {
    const prev = cells[k - 1];
    const next = cells[k + 1];
    let use: UseOf = Use.Taken;
    if (prev !== undefined && next !== undefined && board.kind[i] === Cell.Free) {
      if (Math.abs(prev - next) === 2) use = Use.H;
      else if (Math.abs(prev - next) === 2 * board.width) use = Use.V;
    }
    const was = board.use[i]!;
    board.use[i] = was === Use.None ? use : Use.Taken;
    board.owner[i] = was === Use.None && board.owner[i] === 0 ? edge + 1 : -1;
    if (board.kind[i] !== Cell.Free) board.use[i] = Use.Taken;
  });
}

const centre = (r: CellRect): Point => ({
  x: r.x + Math.floor((r.width - 1) / 2),
  y: r.y + Math.floor((r.height - 1) / 2),
});

/** The port nearest `p`, for a forced route. */
function nearest(board: Board, candidates: Map<number, Dir>, p: Point): [number, Dir] | undefined {
  let best: [number, Dir] | undefined;
  let bestD = Infinity;
  for (const [i, d] of candidates) {
    const x = i % board.width;
    const y = (i - x) / board.width;
    const dist = Math.abs(x - p.x) + Math.abs(y - p.y);
    if (dist < bestD) {
      bestD = dist;
      best = [i, d];
    }
  }
  return best;
}

/** A knee from `a` to `b`: across, then down. */
function knee(board: Board, a: number, b: number): number[] {
  const ax = a % board.width;
  const ay = (a - ax) / board.width;
  const bx = b % board.width;
  const by = (b - bx) / board.width;
  const out: number[] = [];
  const sx = Math.sign(bx - ax);
  const sy = Math.sign(by - ay);
  for (let x = ax; x !== bx; x += sx) out.push(board.at(x, ay));
  for (let y = ay; y !== by; y += sy) out.push(board.at(bx, y));
  out.push(b);
  return out;
}

/**
 * Routes one edge and marks it on the board: through the first of `tries` (pairs of ends) a
 * route is found for, lines meeting their boxes at right angles; failing that, with an end that
 * turns where it meets its box (a tight frame margin); else as a knee between the first pair's
 * ports.
 */
export function route(
  board: Board,
  edge: number,
  tries: readonly (readonly [EndSpec, EndSpec])[]
): Route {
  const toPoint = (i: number): Point => {
    const x = i % board.width;
    return { x, y: (i - x) / board.width };
  };
  for (const strict of [true, false])
    for (const [start, end] of tries) {
      const starts = ports(board, start);
      const goals = ports(board, end);
      if (starts.size === 0 || goals.size === 0) continue;
      for (const margin of M.windows) {
        const win = windowOf(board, start.rect, end.rect, margin);
        const found = search(board, {
          starts,
          goals,
          startRect: start.rect,
          goalRect: end.rect,
          win,
          strict,
        });
        // No route inside the window: a larger one helps only if the search met its edge.
        if (found === 'exhausted') break;
        if (found === 'clipped') continue;
        mark(board, found.cells, edge);
        return {
          cells: found.cells.map(toPoint),
          startInto: starts.get(found.cells[0]!)!,
          endInto: goals.get(found.cells[found.cells.length - 1]!)!,
          forced: false,
        };
      }
    }
  const [start, end] = tries[0]!;
  const starts = ports(board, start);
  const goals = ports(board, end);
  // No route: a knee between the ports nearest the other box, over whatever is there (any
  // port, taken or not, when every one is).
  const s = nearest(board, starts.size > 0 ? starts : ports(board, start, true), centre(end.rect));
  const e = nearest(board, goals.size > 0 ? goals : ports(board, end, true), centre(start.rect));
  if (!s || !e) return { cells: [], startInto: DOWN, endInto: DOWN, forced: true };
  const cells = knee(board, s[0], e[0]);
  mark(board, cells, edge);
  return { cells: cells.map(toPoint), startInto: s[1], endInto: e[1], forced: true };
}
