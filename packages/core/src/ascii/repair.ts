// The repair router for text output (DESIGN §6.3, D78, D140, R-ASCII-1). The layered engine
// lays the ASCII path out on the grid, so boxes, ports and tracks sit on whole cells and every
// edge end has a cell of its own (#42). What is left after snapping (research/ascii-snapping.md,
// "What the repair router has to cover") is local: edges sharing cells (mostly fan-in and
// fan-out siblings), runs along group frames, corner touches, a group's edge to its own member,
// and the odd segment through a box or a label. Those segments, and only those, are re-routed
// by an A* over cells with a turn penalty; everything else keeps the engine's route.
//
// Rules, per cell an edge uses (its arms are the directions the line leaves the cell in):
// - node boxes are walls, and so are other edges' label patches and group titles;
// - a group frame may only be crossed straight through, and only by an edge with exactly one
//   end inside the group: no runs along a frame, no stray crossings;
// - another edge's cell may be crossed at right angles when both lines run straight through
//   it; sharing an arm (a parallel run) or touching where either turns or ends is a collision.
//   D140: siblings are kept apart wherever a lane exists, never merged into a bus.
//
// Edges are processed in model order and each finished route is marked before the next one, so
// the output is deterministic (R-ARCH-6). Self-loops keep their layout shape. The search is
// bounded to a window around the colliding stretch, grown a few times; when no route is found
// the snapped route is kept and the collision reported.
import type { Box, LayoutGraph, LayoutModel, Point } from '../layout/types.ts';
import { DOWN, DX, DY, INTO, LEFT, RIGHT, UP, opposite } from './directions.ts';
import { snapRoute } from './snap.ts';

/** What a route ran into. */
export type CollisionKind = 'box' | 'label' | 'frame' | 'shared' | 'corner';

export interface Collision {
  /** The edge whose route collides. */
  edge: string;
  kind: CollisionKind;
  /** The cell, in cell indices. */
  cell: Point;
  /** What it ran into: a node, group or edge id (an edge id for a label). */
  with: string;
}

export interface RepairOptions {
  /** Cost of one bend, on top of one per cell. Defaults to 3. */
  turnPenalty?: number;
  /** Margins (cells) the search window is grown by around a colliding stretch. */
  windows?: readonly number[];
  /** Most cells one search may expand before it gives up. */
  maxSearch?: number;
  /**
   * Most cells all the searches of one repair may expand together (#710). Once they are spent,
   * the stretches still colliding keep their snapped route and are reported as `unresolved`.
   */
  maxExpanded?: number;
}

export interface RepairResult {
  /** Every edge's route as a cell polyline (corners only), in model order. */
  routes: Map<string, Point[]>;
  /** Edges with at least one repaired stretch. */
  repaired: string[];
  /** Collisions no route was found around; their snapped stretch is kept. */
  unresolved: Collision[];
  /**
   * Cells the searches expanded, all edges together: the work the repair did, bounded by
   * `maxSearch` per search and `maxExpanded` in all (timing is the bench's, R-PERF-5).
   */
  expanded: number;
}

const VERTICAL = (1 << UP) | (1 << DOWN);
const HORIZONTAL = (1 << LEFT) | (1 << RIGHT);
/** Reserves an edge end: anything else in that cell collides. */
const END = 0xf;
const DEFAULT_WINDOWS = [4, 16, 64] as const;
const DEFAULT_MAX_SEARCH = 400_000;
const DEFAULT_MAX_EXPANDED = 1_000_000;

const straight = (arms: number): boolean => arms === VERTICAL || arms === HORIZONTAL;

interface Owner {
  edge: number;
  arms: number;
}

interface FrameCell {
  group: string;
  /** The arms that cross the frame here, 0 on a corner. */
  across: number;
}

interface EdgeInfo {
  id: string;
  index: number;
  source: string;
  target: string;
  srcArm: number;
  tgtArm: number;
  loop: boolean;
  /** The cells the edge ends in (set once its route is snapped). */
  ends: Set<number>;
}

/** The cells of a box from its centre and size (validateGrid's convention). */
function rect(b: { x: number; y: number; width: number; height: number }, grid: number): Box {
  return {
    left: Math.round((b.x - b.width / 2) / grid + 0.5),
    top: Math.round((b.y - b.height / 2) / grid + 0.5),
    right: Math.round((b.x + b.width / 2) / grid - 0.5),
    bottom: Math.round((b.y + b.height / 2) / grid - 0.5),
  };
}

/** What is where: walls, frames, labels and the cells edges already use. */
class Field {
  readonly width: number;
  readonly height: number;
  /** Node index + 1 per cell, 0 where there is no box (review 6: no scan per probe). */
  private readonly box: Int32Array;
  private readonly nodeIds: string[];
  /** Every label and title over a cell: overlaps keep all their owners (review 5). */
  private readonly labels = new Map<number, string[]>();
  private readonly frames = new Map<number, FrameCell[]>();
  private readonly owners = new Map<number, Owner[]>();
  private readonly parent = new Map<string, string>();
  private readonly edgeIds: string[] = [];

  constructor(
    private readonly graph: LayoutGraph,
    private readonly model: LayoutModel,
    private readonly grid: number
  ) {
    this.width = Math.round(model.width / grid);
    this.height = Math.round(model.height / grid);
    this.box = new Int32Array(this.width * this.height);
    this.nodeIds = [...model.nodes.keys()];
    for (const n of graph.nodes) if (n.parent) this.parent.set(n.id, n.parent);
    for (const g of graph.groups) if (g.parent) this.parent.set(g.id, g.parent);
    [...model.nodes.values()].forEach((b, k) =>
      this.fill(rect(b, grid), (i) => (this.box[i] = k + 1))
    );
    for (const g of graph.groups) this.addGroup(g.id, g.title);
    for (const e of graph.edges) {
      const placed = model.edges.get(e.id);
      if (e.label && placed?.label)
        this.fill(rect({ ...placed.label, ...e.label }, grid), (i) => this.addLabel(i, e.id));
    }
  }

  inPage(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  index(x: number, y: number): number {
    return y * this.width + x;
  }

  /** Whether `id` (a node or group) lies inside group `group`. */
  inside(id: string, group: string): boolean {
    for (let p = this.parent.get(id); p !== undefined; p = this.parent.get(p))
      if (p === group) return true;
    return false;
  }

  /** Marks the cells of an edge (an end reserves its cell whole). */
  occupy(edge: EdgeInfo, cell: number, arms: number): void {
    this.edgeIds[edge.index] = edge.id;
    const list = this.owners.get(cell);
    if (list) list.push({ edge: edge.index, arms });
    else this.owners.set(cell, [{ edge: edge.index, arms }]);
  }

  /** What `edge` runs into when it uses cell (x, y) with `arms`, if anything. */
  check(edge: EdgeInfo, x: number, y: number, arms: number): [CollisionKind, string] | undefined {
    if (!this.inPage(x, y)) return ['box', ''];
    const i = this.index(x, y);
    const box = this.box[i]!;
    if (box) return ['box', this.nodeIds[box - 1]!];
    const label = this.labels.get(i)?.find((owner) => owner !== edge.id);
    if (label !== undefined) return ['label', label];
    for (const f of this.frames.get(i) ?? []) {
      // An edge between a group and its own member ends on that group's border (#42).
      if ((f.group === edge.source || f.group === edge.target) && edge.ends.has(i)) continue;
      const crosses = this.inside(edge.source, f.group) !== this.inside(edge.target, f.group);
      if (!crosses || f.across === 0 || arms !== f.across) return ['frame', f.group];
    }
    let used = 0;
    let other = -1;
    for (const o of this.owners.get(i) ?? []) {
      if (o.edge === edge.index) continue;
      used |= o.arms;
      if (other < 0) other = o.edge;
    }
    if (used === 0) return undefined;
    const id = this.edgeIds[other] ?? '';
    if (used & arms) return ['shared', id];
    return straight(used) && straight(arms) ? undefined : ['corner', id];
  }

  private addLabel(cell: number, owner: string): void {
    const list = this.labels.get(cell);
    if (!list) this.labels.set(cell, [owner]);
    else if (!list.includes(owner)) list.push(owner);
  }

  private fill(r: Box, f: (i: number) => void): void {
    for (let y = Math.max(r.top, 0); y <= Math.min(r.bottom, this.height - 1); y++)
      for (let x = Math.max(r.left, 0); x <= Math.min(r.right, this.width - 1); x++)
        f(this.index(x, y));
  }

  private addGroup(id: string, title: { width: number; height: number } | undefined): void {
    const g = this.model.groups.get(id);
    if (!g) return;
    const r = rect(g, this.grid);
    const frame = (x: number, y: number, across: number): void => {
      if (!this.inPage(x, y)) return;
      const i = this.index(x, y);
      const list = this.frames.get(i);
      if (list) list.push({ group: id, across });
      else this.frames.set(i, [{ group: id, across }]);
    };
    for (let x = r.left; x <= r.right; x++) {
      const corner = x === r.left || x === r.right;
      frame(x, r.top, corner ? 0 : VERTICAL);
      if (r.bottom !== r.top) frame(x, r.bottom, corner ? 0 : VERTICAL);
    }
    for (let y = r.top + 1; y < r.bottom; y++) {
      frame(r.left, y, HORIZONTAL);
      if (r.right !== r.left) frame(r.right, y, HORIZONTAL);
    }
    // The title is text: a wall, on the frame or inside the padding.
    if (title && title.width > 0)
      this.fill(
        rect(
          { ...g.title, width: title.width, height: Math.max(title.height, this.grid) },
          this.grid
        ),
        (i) => this.addLabel(i, id)
      );
  }
}

/** A route as the cells it passes, with the direction of each step. */
interface Path {
  cells: number[];
  xs: number[];
  ys: number[];
}

function expand(field: Field, bends: readonly Point[]): Path {
  const path: Path = { cells: [], xs: [], ys: [] };
  const add = (x: number, y: number): void => {
    path.cells.push(field.index(x, y));
    path.xs.push(x);
    path.ys.push(y);
  };
  bends.forEach((p, k) => {
    const q = bends[k - 1];
    if (!q) return add(p.x, p.y);
    const dx = Math.sign(p.x - q.x);
    const dy = Math.sign(p.y - q.y);
    // Review 3: a diagonal would never reach its corner.
    if (dx !== 0 && dy !== 0)
      throw new RangeError(`route is not orthogonal: (${q.x}, ${q.y}) to (${p.x}, ${p.y})`);
    if (dx === 0 && dy === 0) return;
    for (let x = q.x + dx, y = q.y + dy; ; x += dx, y += dy) {
      add(x, y);
      if (x === p.x && y === p.y) break;
    }
  });
  return path;
}

function step(xs: number[], ys: number[], i: number): number {
  const dx = xs[i + 1]! - xs[i]!;
  const dy = ys[i + 1]! - ys[i]!;
  if (dx > 0) return RIGHT;
  if (dx < 0) return LEFT;
  return dy > 0 ? DOWN : UP;
}

/** The arms of cell `i` of a path. */
function armsAt(path: Path, i: number, edge: EdgeInfo): number {
  const last = path.cells.length - 1;
  const enter = i === 0 ? edge.srcArm : opposite(step(path.xs, path.ys, i - 1));
  const leave = i === last ? edge.tgtArm : step(path.xs, path.ys, i);
  return (1 << enter) | (1 << leave);
}

/** The corners of a path. */
function corners(path: Path): Point[] {
  const out: Point[] = [];
  const n = path.cells.length;
  for (let i = 0; i < n; i++) {
    if (i > 0 && i < n - 1 && step(path.xs, path.ys, i - 1) === step(path.xs, path.ys, i)) continue;
    out.push({ x: path.xs[i]!, y: path.ys[i]! });
  }
  return out;
}

/** A binary min-heap of states, ties broken by insertion order. */
class Heap {
  private readonly keys: number[] = [];
  private readonly order: number[] = [];
  private readonly items: number[] = [];
  private count = 0;

  get size(): number {
    return this.items.length;
  }

  push(key: number, item: number): void {
    this.keys.push(key);
    this.order.push(this.count++);
    this.items.push(item);
    let i = this.items.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      this.swap(i, p);
      i = p;
    }
  }

  pop(): number {
    const top = this.items[0]!;
    const last = this.items.length - 1;
    this.swap(0, last);
    this.keys.pop();
    this.order.pop();
    this.items.pop();
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < this.items.length && this.less(l, m)) m = l;
      if (r < this.items.length && this.less(r, m)) m = r;
      if (m === i) break;
      this.swap(i, m);
      i = m;
    }
    return top;
  }

  private less(a: number, b: number): boolean {
    const ka = this.keys[a]!;
    const kb = this.keys[b]!;
    return ka < kb || (ka === kb && this.order[a]! < this.order[b]!);
  }

  private swap(a: number, b: number): void {
    const { keys, order, items } = this;
    const k = keys[a]!;
    keys[a] = keys[b]!;
    keys[b] = k;
    const o = order[a]!;
    order[a] = order[b]!;
    order[b] = o;
    const t = items[a]!;
    items[a] = items[b]!;
    items[b] = t;
  }
}

/**
 * The per-state tables of the searches of one repair, shared so that a search pays for the
 * states it reaches and not for its whole window (#710). A state belongs to the current search
 * when its `stamp` is that search's number; any other state is unreached.
 */
class Scratch {
  cost = new Float64Array(0);
  from = new Int32Array(0);
  stamp = new Uint32Array(0);
  private searches = 0;

  /** Starts a search over `states` states; returns its number. */
  begin(states: number): number {
    if (this.stamp.length < states) {
      this.cost = new Float64Array(states);
      this.from = new Int32Array(states);
      this.stamp = new Uint32Array(states);
      this.searches = 0;
    }
    return ++this.searches;
  }
}

interface Search {
  field: Field;
  edge: EdgeInfo;
  turnPenalty: number;
  maxSearch: number;
  maxExpanded: number;
  /** Where the expanded cells are counted. */
  result: RepairResult;
  scratch: Scratch;
}

/**
 * A* over cells from `s` (reached travelling `inDir`) to `t` (left in direction `tOut`, an arm),
 * inside `window`. Returns the cells after `s` up to and including `t`, or undefined.
 */
/** Where a search goes: cell `t`, left in direction `tOut`, inside `window`, off `own` cells. */
interface Goal {
  t: [number, number];
  tOut: number;
  window: Box;
  /** The edge's own route before the start and after `t`. */
  own: ReadonlySet<number>;
}

function search(
  { field, edge, turnPenalty, maxSearch, maxExpanded, result, scratch }: Search,
  s: [number, number],
  inDir: number,
  { t, tOut, window, own }: Goal
): [number, number][] | undefined {
  const ww = window.right - window.left + 1;
  const wh = window.bottom - window.top + 1;
  const states = ww * wh * 4;
  const goal = states;
  const run = scratch.begin(states + 1);
  const { cost, from, stamp } = scratch;
  const costOf = (i: number): number => (stamp[i] === run ? cost[i]! : Infinity);
  const reach = (i: number, g: number, prev: number): void => {
    stamp[i] = run;
    cost[i] = g;
    from[i] = prev;
  };
  const state = (x: number, y: number, d: number): number =>
    ((y - window.top) * ww + (x - window.left)) * 4 + d;
  const heap = new Heap();
  const h = (x: number, y: number): number => Math.abs(x - t[0]) + Math.abs(y - t[1]);
  const start = state(s[0], s[1], inDir);
  reach(start, 0, -1);
  heap.push(h(s[0], s[1]), start);
  let expanded = 0;
  while (heap.size > 0) {
    const cur = heap.pop();
    if (cur === goal) break;
    if (++expanded > maxSearch || result.expanded >= maxExpanded) return undefined;
    result.expanded++;
    const d = cur % 4;
    const local = (cur - d) / 4;
    const x = (local % ww) + window.left;
    const y = Math.floor(local / ww) + window.top;
    const g = cost[cur]!;
    for (let d2 = 0; d2 < 4; d2++) {
      if (d2 === opposite(d)) continue;
      if (field.check(edge, x, y, (1 << opposite(d)) | (1 << d2))) continue;
      const nx = x + DX[d2]!;
      const ny = y + DY[d2]!;
      if (nx < window.left || nx > window.right || ny < window.top || ny > window.bottom) continue;
      const g2 = g + 1 + (d2 === d ? 0 : turnPenalty);
      if (nx === t[0] && ny === t[1]) {
        // No U-turn into `t`: the route goes on in direction `tOut` from there.
        if (d2 === opposite(tOut)) continue;
        if (field.check(edge, nx, ny, (1 << opposite(d2)) | (1 << tOut))) continue;
        const total = g2 + (d2 === tOut ? 0 : turnPenalty);
        if (total < costOf(goal)) {
          reach(goal, total, cur);
          heap.push(total, goal);
        }
        continue;
      }
      // The edge's own route before `s` and after `t` is not crossed or doubled back over.
      if (own.has(field.index(nx, ny))) continue;
      const next = state(nx, ny, d2);
      if (g2 < costOf(next)) {
        reach(next, g2, cur);
        heap.push(g2 + h(nx, ny), next);
      }
    }
  }
  if (stamp[goal] !== run) return undefined;
  const out: [number, number][] = [[t[0], t[1]]];
  for (let cur = from[goal]!; cur !== start; cur = from[cur]!) {
    const local = (cur - (cur % 4)) / 4;
    out.push([(local % ww) + window.left, Math.floor(local / ww) + window.top]);
  }
  return out.reverse();
}

function edgeInfos(graph: LayoutGraph, model: LayoutModel): EdgeInfo[] {
  const out: EdgeInfo[] = [];
  graph.edges.forEach((e, index) => {
    const placed = model.edges.get(e.id);
    if (!placed) return;
    out.push({
      id: e.id,
      index,
      source: e.source,
      target: e.target,
      srcArm: INTO[placed.ports.source],
      tgtArm: INTO[placed.ports.target],
      loop: e.source === e.target,
      ends: new Set(),
    });
  });
  return out;
}

function reserveEnds(field: Field, edges: EdgeInfo[], paths: Map<string, Path>): void {
  for (const e of edges) {
    const path = paths.get(e.id)!;
    const n = path.cells.length - 1;
    for (const i of n > 0 ? [0, n] : [0]) {
      if (!field.inPage(path.xs[i]!, path.ys[i]!)) continue;
      e.ends.add(path.cells[i]!);
      field.occupy(e, path.cells[i]!, END);
    }
  }
}

function commit(field: Field, edge: EdgeInfo, path: Path): void {
  const n = path.cells.length - 1;
  for (let i = 1; i < n; i++)
    if (field.inPage(path.xs[i]!, path.ys[i]!))
      field.occupy(edge, path.cells[i]!, armsAt(path, i, edge));
}

/**
 * Snaps every edge route of a grid `LayoutModel` (D78, D140) and re-routes the stretches that
 * collide: through a node box, another edge's label, a group title or frame (other than a
 * straight crossing of a group the edge enters or leaves), or into another edge's cell other
 * than a right-angle crossing. Routes come back in cell indices, corners only.
 */
export function repairRoutes(
  graph: LayoutGraph,
  model: LayoutModel,
  options: RepairOptions = {}
): RepairResult {
  const grid = graph.grid ?? 1;
  const field = new Field(graph, model, grid);
  const edges = edgeInfos(graph, model);
  const paths = new Map(
    edges.map((e) => [e.id, expand(field, snapRoute(model.edges.get(e.id)!.points, grid))])
  );
  reserveEnds(field, edges, paths);
  const windows = options.windows ?? DEFAULT_WINDOWS;
  const result: RepairResult = { routes: new Map(), repaired: [], unresolved: [], expanded: 0 };
  const scratch = new Scratch();
  for (const edge of edges) {
    const path = paths.get(edge.id)!;
    const ctx: Search = {
      field,
      edge,
      turnPenalty: options.turnPenalty ?? 3,
      maxSearch: options.maxSearch ?? DEFAULT_MAX_SEARCH,
      maxExpanded: options.maxExpanded ?? DEFAULT_MAX_EXPANDED,
      result,
      scratch,
    };
    const fixed = edge.loop ? path : repair(ctx, path, windows, result);
    if (fixed !== path) result.repaired.push(edge.id);
    else if (edge.loop) result.unresolved.push(...collisions(field, edge, path));
    commit(field, edge, fixed);
    result.routes.set(edge.id, corners(fixed));
  }
  return result;
}

/**
 * What cell `i` of a path runs into: the field, or (review 2) a cell the same route already
 * passed, which draws a loop whether it crosses or runs over itself.
 */
function hitAt(
  field: Field,
  edge: EdgeInfo,
  path: Path,
  i: number,
  seen: Set<number>
): [CollisionKind, string] | undefined {
  const cell = path.cells[i]!;
  const again = seen.has(cell);
  seen.add(cell);
  if (again) return ['shared', edge.id];
  return field.check(edge, path.xs[i]!, path.ys[i]!, armsAt(path, i, edge));
}

function collisions(field: Field, edge: EdgeInfo, path: Path): Collision[] {
  const out: Collision[] = [];
  const seen = new Set<number>();
  for (let i = 0; i < path.cells.length; i++) {
    const hit = hitAt(field, edge, path, i, seen);
    if (hit)
      out.push({
        edge: edge.id,
        kind: hit[0],
        cell: { x: path.xs[i]!, y: path.ys[i]! },
        with: hit[1],
      });
  }
  return out;
}

/** Re-routes the colliding stretches of one path; returns it unchanged when nothing collides. */
interface Stretch {
  /** Last clean index before the collision. */
  s: number;
  /** First clean index after it. */
  t: number;
  /** How the route reaches `s`. */
  inDir: number;
  windows: readonly number[];
}

/**
 * Searches around one colliding stretch of `path`: to its first clean cell after, then to the
 * end, in windows growing by `windows`. `out` is the route so far, ending at `s`.
 */
function detour(
  ctx: Search,
  path: Path,
  out: Path,
  { s, t, inDir, windows }: Stretch
): { cells: [number, number][]; end: number } | undefined {
  const n = path.cells.length - 1;
  const sCell: [number, number] = [path.xs[s]!, path.ys[s]!];
  for (const end of t === n ? [n] : [t, n]) {
    const tOut = end === n ? ctx.edge.tgtArm : step(path.xs, path.ys, end);
    let box: Box = { left: sCell[0], top: sCell[1], right: sCell[0], bottom: sCell[1] };
    for (let i = s; i <= end; i++)
      box = {
        left: Math.min(box.left, path.xs[i]!),
        top: Math.min(box.top, path.ys[i]!),
        right: Math.max(box.right, path.xs[i]!),
        bottom: Math.max(box.bottom, path.ys[i]!),
      };
    const own = new Set([...out.cells, ...path.cells.slice(end + 1)]);
    for (const margin of windows) {
      const window: Box = {
        left: Math.max(0, box.left - margin),
        top: Math.max(0, box.top - margin),
        right: Math.min(ctx.field.width - 1, box.right + margin),
        bottom: Math.min(ctx.field.height - 1, box.bottom + margin),
      };
      const cells = search(ctx, sCell, inDir, {
        t: [path.xs[end]!, path.ys[end]!],
        tOut,
        window,
        own,
      });
      if (cells) return { cells, end };
    }
  }
  return undefined;
}

function repair(ctx: Search, path: Path, windows: readonly number[], result: RepairResult): Path {
  const { field, edge } = ctx;
  const n = path.cells.length - 1;
  const seen = new Set<number>();
  const bad = path.cells.map((_, i) => hitAt(field, edge, path, i, seen));
  for (const i of [0, n]) {
    const hit = bad[i];
    if (hit)
      result.unresolved.push({
        edge: edge.id,
        kind: hit[0],
        cell: { x: path.xs[i]!, y: path.ys[i]! },
        with: hit[1],
      });
  }
  if (!bad.some((b, i) => b && i > 0 && i < n)) return path;
  const out: Path = { cells: [], xs: [], ys: [] };
  const add = (x: number, y: number): void => {
    out.cells.push(field.index(x, y));
    out.xs.push(x);
    out.ys.push(y);
  };
  const copy = (from: number, to: number): void => {
    for (let i = from; i <= to; i++) add(path.xs[i]!, path.ys[i]!);
  };
  add(path.xs[0]!, path.ys[0]!);
  let k = 0;
  let changed = false;
  for (;;) {
    let b = k + 1;
    while (b < n && !bad[b]) b++;
    if (b >= n) {
      copy(k + 1, n);
      break;
    }
    copy(k + 1, b - 1);
    const s = b - 1;
    let t = b + 1;
    while (t < n && bad[t]) t++;
    const m = out.cells.length - 1;
    const inDir = m === 0 ? opposite(edge.srcArm) : step(out.xs, out.ys, m - 1);
    const found = detour(ctx, path, out, { s, t, inDir, windows });
    if (found) t = found.end;
    if (found) {
      for (const [x, y] of found.cells) add(x, y);
      changed = true;
    } else {
      copy(b, t);
      for (let i = b; i < t; i++) {
        const hit = bad[i];
        if (hit)
          result.unresolved.push({
            edge: edge.id,
            kind: hit[0],
            cell: { x: path.xs[i]!, y: path.ys[i]! },
            with: hit[1],
          });
      }
    }
    k = t;
    if (k >= n) break;
  }
  if (!changed) return path;
  // A detour may still cross its own new cells; report it rather than draw a silent loop.
  for (const c of collisions(field, edge, out))
    if (c.kind === 'shared' && c.with === edge.id) result.unresolved.push(c);
  return out;
}

/**
 * The collisions in a set of cell routes (default: the model's routes, snapped), checked in
 * model order as `repairRoutes` does: what the ASCII properties assert on (R-ASCII-1).
 */
export function routeCollisions(
  graph: LayoutGraph,
  model: LayoutModel,
  routes?: ReadonlyMap<string, readonly Point[]>
): Collision[] {
  const grid = graph.grid ?? 1;
  const field = new Field(graph, model, grid);
  const edges = edgeInfos(graph, model);
  const paths = new Map(
    edges.map((e) => [
      e.id,
      expand(field, routes?.get(e.id) ?? snapRoute(model.edges.get(e.id)!.points, grid)),
    ])
  );
  reserveEnds(field, edges, paths);
  const out: Collision[] = [];
  for (const edge of edges) {
    const path = paths.get(edge.id)!;
    out.push(...collisions(field, edge, path));
    commit(field, edge, path);
  }
  return out;
}
