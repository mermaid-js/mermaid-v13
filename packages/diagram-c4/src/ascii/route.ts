// The C4 text output's relation router (#545, D459): each relation a stepped line on the cell
// grid from the cell outside its start's side to the cell outside its end's, found by an A*
// search over (cell, heading) that keeps off element cells, boundary header text, the title and
// other relations' ends, and is guided by the layout's routed points: each cell costs its
// distance from them, so the line follows the SVG's route where the grid lets it. A turn, a run
// along a frame and a run along another line cost extra, so lines keep few corners and their own
// lanes. Every search is charged to a budget (R-SEC-5); past it, or with no way through, the line
// is the routed points stepped as they are (the guide the search follows).
import { DX, DY, opposite, type CellRect, type Dir } from '@mermaid-js/core/ascii';
import { sameCell, type Cell, type CellSet } from './grid.ts';

/** One relation to route: its two end cells, the way each goes into its shape, the routed points. */
export interface RouteRequest {
  readonly start: Cell;
  readonly startInto: Dir;
  readonly end: Cell;
  readonly endInto: Dir;
  /** The layout's routed points, in cells (unrounded), from start to end. */
  readonly guide: readonly Cell[];
}

/** What the router reads of the drawing. */
export interface RouteField {
  /** Cells no line enters: elements, boundary header text, the title, frame corners. */
  readonly blocked: CellSet;
  /** Every relation's end cells: a line uses its own only. */
  readonly ends: CellSet;
  /** Frames' top and bottom border cells, and their side cells. */
  readonly frameLevel: CellSet;
  readonly frameUpright: CellSet;
  /** Cells the lines routed so far run level through, and upright. */
  readonly level: CellSet;
  readonly upright: CellSet;
  /** The cells the search may use. */
  readonly bounds: CellRect;
}

/**
 * Search steps left for the drawing (R-SEC-5): the routes' search steps and the label places
 * tried, each place charged its cells.
 */
export class RouteBudget {
  constructor(public left: number) {}

  charge(n: number): void {
    this.left -= n;
  }

  get done(): boolean {
    return this.left <= 0;
  }
}

/** The search steps one relation may take, at the most. */
const ROUTE_CAP = 50_000;

/** How much the search favours cells nearer the end (weighted A*). */
const HASTE = 3;

/** What each step costs. */
const COST = {
  step: 1,
  turn: 4,
  /** Along a frame's border (the line would merge with it), or along another line. */
  along: 40,
  parallel: 30,
  /** Across a frame or another line. */
  cross: 2,
  /** Each cell away from the routed points, up to `guideCap` cells. */
  guide: 0.5,
  guideCap: 8,
} as const;

const isLevel = (d: Dir): boolean => DX[d] !== 0;

/** The distance from (x, y) to the polyline `guide`. */
function guideDistance(x: number, y: number, guide: readonly Cell[]): number {
  if (guide.length === 1) return Math.hypot(x - guide[0]!.x, y - guide[0]!.y);
  let best = Infinity;
  for (let i = 0; i + 1 < guide.length; i++) {
    const a = guide[i]!;
    const b = guide[i + 1]!;
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const len = vx * vx + vy * vy;
    const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * vx + (y - a.y) * vy) / len));
    best = Math.min(best, Math.hypot(x - (a.x + t * vx), y - (a.y + t * vy)));
  }
  return best;
}

/** A binary min-heap of keys by cost, ties by key (so the search is deterministic). */
class Heap {
  private readonly costs: number[] = [];
  private readonly keys: number[] = [];

  get size(): number {
    return this.keys.length;
  }

  private less(i: number, j: number): boolean {
    const a = this.costs[i]!;
    const b = this.costs[j]!;
    return a < b || (a === b && this.keys[i]! < this.keys[j]!);
  }

  private swap(i: number, j: number): void {
    [this.costs[i], this.costs[j]] = [this.costs[j]!, this.costs[i]!];
    [this.keys[i], this.keys[j]] = [this.keys[j]!, this.keys[i]!];
  }

  push(cost: number, key: number): void {
    this.costs.push(cost);
    this.keys.push(key);
    for (let i = this.keys.length - 1; i > 0; ) {
      const up = (i - 1) >> 1;
      if (!this.less(i, up)) break;
      this.swap(i, up);
      i = up;
    }
  }

  pop(): number {
    const top = this.keys[0]!;
    const last = this.keys.length - 1;
    this.swap(0, last);
    this.costs.pop();
    this.keys.pop();
    for (let i = 0; ; ) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < last && this.less(l, m)) m = l;
      if (r < last && this.less(r, m)) m = r;
      if (m === i) break;
      this.swap(i, m);
      i = m;
    }
    return top;
  }
}

/** A step of the search: onto cell (x, y), going `d`. */
interface Step {
  readonly x: number;
  readonly y: number;
  readonly d: Dir;
}

/** What a step costs, a turn aside. */
function stepCost(field: RouteField, guide: readonly Cell[], { x, y, d }: Step): number {
  const level = isLevel(d);
  let step = COST.step;
  if ((level ? field.frameLevel : field.frameUpright).has(x, y)) step += COST.along;
  else if ((level ? field.frameUpright : field.frameLevel).has(x, y)) step += COST.cross;
  if ((level ? field.level : field.upright).has(x, y)) step += COST.parallel;
  else if ((level ? field.upright : field.level).has(x, y)) step += COST.cross;
  return step + COST.guide * Math.min(COST.guideCap, guideDistance(x, y, guide));
}

/** The cells of the cheapest line for `req`, or undefined past the budget or with no way. */
function search(req: RouteRequest, field: RouteField, budget: RouteBudget): Cell[] | undefined {
  const { start, end, endInto, guide } = req;
  const { bounds } = field;
  const keyOf = (x: number, y: number, d: Dir): number =>
    ((y - bounds.y) * bounds.width + (x - bounds.x)) * 4 + d;
  const cellOf = (key: number): [number, number, Dir] => {
    const d = (key % 4) as Dir;
    const i = (key - d) / 4;
    return [bounds.x + (i % bounds.width), bounds.y + Math.floor(i / bounds.width), d];
  };
  const inBounds = (x: number, y: number): boolean =>
    x >= bounds.x && y >= bounds.y && x < bounds.x + bounds.width && y < bounds.y + bounds.height;
  // Weighted (the cells left count `HASTE` steps): a little longer than the cheapest at most,
  // and far fewer steps searched.
  const remaining = (x: number, y: number): number =>
    HASTE * (Math.abs(x - end.x) + Math.abs(y - end.y));
  if (!inBounds(start.x, start.y) || !inBounds(end.x, end.y)) return undefined;

  const cost = new Map<number, number>();
  const parent = new Map<number, number>();
  const closed = new Set<number>();
  const open = new Heap();
  const first = keyOf(start.x, start.y, opposite(req.startInto));
  cost.set(first, 0);
  open.push(remaining(start.x, start.y), first);
  const cap = Math.min(ROUTE_CAP, budget.left);
  let spent = 0;
  let goal: number | undefined;
  while (open.size > 0 && spent < cap) {
    const key = open.pop();
    if (closed.has(key)) continue;
    closed.add(key);
    spent++;
    const [x, y, d] = cellOf(key);
    if (x === end.x && y === end.y) {
      goal = key;
      break;
    }
    const base = cost.get(key)!;
    for (const nd of [0, 1, 2, 3] as const) {
      if (nd === opposite(d)) continue;
      const nx = x + DX[nd];
      const ny = y + DY[nd];
      if (!inBounds(nx, ny)) continue;
      const atEnd = nx === end.x && ny === end.y;
      // The end only straight into its shape; no other relation's end, nothing blocked.
      if (atEnd ? nd !== endInto : field.blocked.has(nx, ny) || field.ends.has(nx, ny)) continue;
      const step = stepCost(field, guide, { x: nx, y: ny, d: nd }) + (nd === d ? 0 : COST.turn);
      const next = keyOf(nx, ny, nd);
      const total = base + step;
      if (total >= (cost.get(next) ?? Infinity)) continue;
      cost.set(next, total);
      parent.set(next, key);
      open.push(total + remaining(nx, ny), next);
    }
  }
  budget.left -= spent;
  if (goal === undefined) return undefined;
  const out: Cell[] = [];
  for (let k: number | undefined = goal; k !== undefined; k = parent.get(k)) {
    const [x, y] = cellOf(k);
    out.push({ x, y });
  }
  return out.reverse();
}

/** Every cell along `points`, in order (each pair level or upright). */
export function cellsAlong(points: readonly Cell[]): Cell[] {
  const out: Cell[] = [points[0]!];
  for (let i = 0; i + 1 < points.length; i++) {
    const b = points[i + 1]!;
    let c = out[out.length - 1]!;
    while (!sameCell(c, b)) {
      const step =
        b.x !== c.x ? { x: Math.sign(b.x - c.x), y: 0 } : { x: 0, y: Math.sign(b.y - c.y) };
      c = { x: c.x + step.x, y: c.y + step.y };
      out.push(c);
    }
  }
  return out;
}

/**
 * The routed points stepped as they are, as corners: each pair that is neither level nor upright
 * gets an L, or a Z when it is the only pair and both ends leave level (or both upright): the
 * middle leg halfway, each end square to its side.
 */
function steppedCorners(req: RouteRequest): Cell[] {
  const inner = req.guide.slice(1, -1).map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
  const points = [req.start, ...inner, req.end];
  const corners: Cell[] = [points[0]!];
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    if (a.x !== b.x && a.y !== b.y) {
      const startLevel = isLevel(req.startInto);
      if (points.length === 2 && startLevel === isLevel(req.endInto)) {
        const m = startLevel ? Math.round((a.x + b.x) / 2) : Math.round((a.y + b.y) / 2);
        if (startLevel) corners.push({ x: m, y: a.y }, { x: m, y: b.y });
        else corners.push({ x: a.x, y: m }, { x: b.x, y: m });
      } else if (i === 0) corners.push(startLevel ? { x: b.x, y: a.y } : { x: a.x, y: b.y });
      else corners.push(isLevel(req.endInto) ? { x: a.x, y: b.y } : { x: b.x, y: a.y });
    }
    corners.push(b);
  }
  return corners;
}

/** A relation's cells, from start to end: searched, else stepped. */
export function routeLine(req: RouteRequest, field: RouteField, budget: RouteBudget): Cell[] {
  if (sameCell(req.start, req.end)) return [req.start];
  // The search follows the routed points stepped; a straight route's diagonal would draw a stair.
  const corners = steppedCorners(req);
  return search({ ...req, guide: corners }, field, budget) ?? cellsAlong(corners);
}
