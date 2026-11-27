// Ported from Pele, src/layout/index.ts at 3a2f075.
// Changes from Pele: the grid mode (D78, D140) lives here, split out of `index.ts`, which reaches
// it through `GridHooks` (grid.ts). The algorithm is unchanged.
// cspell:ignore cnode cnodes
//
// What the layered engine does to the model on a grid of character cells: grows the sides that
// have too many ends, places the group titles, puts routes onto cells and lays out self-loops.
import type {
  LayoutGraph,
  LayoutModel,
  LayoutModelEdge,
  LayoutModelGroup,
  LayoutModelNode,
  Point,
  RoutePoint,
  Side,
} from '../types.ts';
import type { CNode } from './compound.ts';
import { edgeOn, floorTo } from './grid-layout.ts';
import { pxProfile, type LayoutMetrics } from '../units.ts';

// The room `k` edge ends take along one side on the grid: a cell each, `portPitch` apart, and
// clear of both corners (D140).
function sideRoom(k: number, pitch: number, grid: number): number {
  return (k - 1) * pitch + 3 * grid;
}

// In grid mode every edge end gets a cell of its own on its side (D140). A side with more ends
// than it has room for grows (wider for top and bottom, taller for left and right), and the
// layout runs again with the grown boxes (`rerun`), which the model reports. Ends are never
// bundled. Returns the graph as grown, and its model.
export function growOnGrid(
  grid: number,
  graph: LayoutGraph,
  first: LayoutModel,
  rerun: (grown: LayoutGraph) => LayoutModel
): { graph: LayoutGraph; model: LayoutModel } {
  let model = first;
  const M = graph.metrics ?? pxProfile.engine;
  const pitch = Math.max(grid, edgeOn(M.portPitch, grid));
  let current = graph;
  for (let pass = 0; pass < 3; pass++) {
    const crowded = placeTitles(current, model, grid);
    const count = new Map<string, Record<Side, number>>();
    const add = (id: string, side: Side): void => {
      let c = count.get(id);
      if (!c) count.set(id, (c = { top: 0, right: 0, bottom: 0, left: 0 }));
      c[side]++;
    };
    for (const e of current.edges) {
      const placed = model.edges.get(e.id)!;
      add(e.source, placed.ports.source);
      add(e.target, placed.ports.target);
    }
    // Edges that cross a group's border take a cell of that side too.
    for (const [id, g] of model.groups) {
      for (const [side, n] of Object.entries(crossings(g, model, grid)) as [Side, number][])
        for (let i = 0; i < n; i++) add(id, side);
    }
    // The size each side of `id` needs for its ends, at least `width` × `height`.
    const need = (id: string, width: number, height: number): [number, number] => {
      const c = count.get(id);
      if (!c) return [width, height];
      const across = Math.max(c.top, c.bottom);
      const along = Math.max(c.left, c.right);
      return [
        across > 0 ? Math.max(width, sideRoom(across, pitch, grid)) : width,
        along > 0 ? Math.max(height, sideRoom(along, pitch, grid)) : height,
      ];
    };
    const nodes = current.nodes.map((n) => {
      const [width, height] = need(n.id, n.width, n.height);
      if (width === n.width && height === n.height) return n;
      return { ...n, width, height };
    });
    // A group (an empty one, mostly) grows by padding: sideways evenly, downwards at the bottom
    // so the title stays on the top border.
    const groups = current.groups.map((g) => {
      const placed = model.groups.get(g.id)!;
      const [width, height] = need(g.id, placed.width, placed.height);
      // A title with no room on the border between the edges that cross it gets more: each side
      // grows by what the title lacks beside the outermost crossings.
      const dx = Math.max(Math.ceil((width - placed.width) / 2), crowded.get(g.id) ?? 0);
      const dy = height - placed.height;
      if (dx === 0 && dy === 0) return g;
      const { top, right, bottom, left } = g.padding;
      return { ...g, padding: { top, right: right + dx, bottom: bottom + dy, left: left + dx } };
    });
    const grew =
      nodes.some((n, i) => n !== current.nodes[i]) ||
      groups.some((g, i) => g !== current.groups[i]);
    if (!grew) break;
    current = { ...current, nodes, groups };
    model = rerun(current);
  }
  placeTitles(current, model, grid);
  return { graph: current, model };
}

// On the grid a group's title sits on its top border row, and no edge may end or cross there
// under it (nor in the blank cell either side, `┌─ one ───┐`). Each title moves along the border,
// from the middle, to the nearest run of cells no route touches (off the corners). Failing that,
// the group's own edges that end above its top border step aside along the row above, so the title
// keeps a run of its own. Returns the groups whose titles still found none, each with the cells it
// should grow by on both sides.
function placeTitles(graph: LayoutGraph, model: LayoutModel, grid: number): Map<string, number> {
  const crowded = new Map<string, number>();
  for (const g of graph.groups) {
    const width = g.title?.width ?? 0;
    const placed = model.groups.get(g.id)!;
    if (width <= 0) continue;
    const left = placed.x - placed.width / 2 + grid / 2;
    const right = left + placed.width - grid;
    const row = placed.y - placed.height / 2 + grid / 2;
    // Cells of the border row routes run through.
    const crossed = new Set<number>();
    for (const e of model.edges.values()) {
      const p = e.points;
      for (let i = 0; i < p.length; i++) {
        const a = p[Math.max(0, i - 1)]!;
        const b = p[i]!;
        if (Math.min(a.y, b.y) > row || Math.max(a.y, b.y) < row) continue;
        for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x += grid) crossed.add(x);
      }
    }
    // The group's own edges off its top side end on the row above: their tee is on the border.
    const ends = topEnds(graph, model, g.id, row - grid);
    const used = new Set([...crossed, ...ends.map((end) => end.x)]);
    const middle = Math.round(placed.title.x - width / 2 + grid / 2);
    const band = (lo: number, x: number): boolean => x >= lo - grid && x <= lo + width;
    const clear = (lo: number, cells: ReadonlySet<number>): boolean => {
      for (let x = lo - grid; x <= lo + width; x += grid) if (cells.has(x)) return false;
      return true;
    };
    const runs: number[] = [];
    for (let lo = left + grid; lo + width - grid <= right - grid; lo += grid) runs.push(lo);
    runs.sort((a, b) => Math.abs(a - middle) - Math.abs(b - middle) || a - b);
    let best = runs.find((lo) => clear(lo, used));
    if (best === undefined) {
      // Ends under the title move to the nearest cell of the row above outside its band.
      for (const lo of runs) {
        if (!clear(lo, crossed)) continue;
        const moves = stepAside(ends, crossed, {
          inBand: (x) => band(lo, x),
          min: left + grid,
          max: right - grid,
          grid,
        });
        if (!moves) continue;
        for (const [end, x] of moves) moveEnd(model, end, x);
        best = lo;
        break;
      }
    }
    if (best === undefined) {
      if (!clear(middle, used)) {
        const inner = [...crossed].filter((x) => x > left && x < right);
        if (inner.length === 0) {
          // Only the group's own ends: room for the title, its blank cells and each end.
          const room = right - left - grid;
          const need = width + 2 * grid + ends.length * grid;
          crowded.set(g.id, Math.max(grid, Math.ceil((need - room) / 2)));
        } else {
          const first = Math.min(...inner);
          const last = Math.max(...inner);
          // Free cells between the corner's gap and the first crossing, on either side.
          const room = Math.max(first - (left + grid), right - grid - last, 0) - grid;
          crowded.set(g.id, Math.max(grid, Math.ceil(width - room)));
        }
      }
      continue;
    }
    placed.title = { ...placed.title, x: best + width / 2 - grid / 2 };
  }
  return crowded;
}

interface TopEnd {
  edge: string;
  end: 'source' | 'target';
  x: number;
  /** Whether the route runs straight for two cells or more from the end: room for a jog. */
  jog: boolean;
}

// The ends of a group's own edges that sit on `row`, above its top border.
function topEnds(graph: LayoutGraph, model: LayoutModel, id: string, row: number): TopEnd[] {
  const out: TopEnd[] = [];
  for (const e of graph.edges) {
    const placed = model.edges.get(e.id)!;
    const p = placed.points;
    const jog = (a: Point, b: Point | undefined): boolean =>
      b !== undefined && a.x === b.x && Math.abs(b.y - a.y) >= 2;
    const first = p[0]!;
    const last = p.at(-1)!;
    if (e.source === id && placed.ports.source === 'top' && first.y === row)
      out.push({ edge: e.id, end: 'source', x: first.x, jog: jog(first, p[1]) });
    if (e.target === id && placed.ports.target === 'top' && last.y === row)
      out.push({ edge: e.id, end: 'target', x: last.x, jog: jog(last, p.at(-2)) });
  }
  return out;
}

// New cells for the ends under a title band: the nearest free cell of the row each, off the
// corners and the band; only ends whose last stretch runs straight for two cells or more can jog.
function stepAside(
  ends: TopEnd[],
  crossed: ReadonlySet<number>,
  row: { inBand: (x: number) => boolean; min: number; max: number; grid: number }
): [TopEnd, number][] | undefined {
  const { inBand, min, max, grid } = row;
  const taken = new Set([...crossed, ...ends.filter((e) => !inBand(e.x)).map((e) => e.x)]);
  const moves: [TopEnd, number][] = [];
  for (const end of ends) {
    if (!inBand(end.x)) continue;
    if (!end.jog) return undefined;
    let to: number | undefined;
    for (let d = grid; to === undefined && (end.x - d >= min || end.x + d <= max); d += grid) {
      for (const x of [end.x - d, end.x + d])
        if (to === undefined && x >= min && x <= max && !inBand(x) && !taken.has(x)) to = x;
    }
    if (to === undefined) return undefined;
    taken.add(to);
    moves.push([end, to]);
  }
  return moves;
}

// Moves one end along its row to `x`, with a jog in the cell before it (the route's straight
// last stretch keeps its other cells).
function moveEnd(model: LayoutModel, end: TopEnd, x: number): void {
  const placed = model.edges.get(end.edge)!;
  const p = end.end === 'target' ? [...placed.points].reverse() : [...placed.points];
  const a = p[0]!;
  const b = p[1]!;
  const y = a.y + Math.sign(b.y - a.y);
  const jog: RoutePoint[] = [
    { ...a, x },
    { x, y, axis: 'v' },
    { x: a.x, y, axis: 'h' },
  ];
  const points = [...jog, ...p.slice(1)];
  placed.points = end.end === 'target' ? points.reverse() : points;
}

// How many route segments cross each side of a group's border (grid mode, in cells).
function crossings(g: LayoutModelGroup, model: LayoutModel, grid: number): Record<Side, number> {
  const left = g.x - g.width / 2 + grid / 2;
  const top = g.y - g.height / 2 + grid / 2;
  const right = left + g.width - grid;
  const bottom = top + g.height - grid;
  const out: Record<Side, number> = { top: 0, right: 0, bottom: 0, left: 0 };
  for (const e of model.edges.values()) {
    const p = e.points;
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1]!;
      const b = p[i]!;
      const across = (v: number, lo: number, hi: number): boolean =>
        (lo < v && v < hi) || (hi < v && v < lo);
      if (a.x === b.x && a.x > left && a.x < right) {
        if (across(top, a.y, b.y)) out.top++;
        if (across(bottom, a.y, b.y)) out.bottom++;
      } else if (a.y === b.y && a.y > top && a.y < bottom) {
        if (across(left, a.x, b.x)) out.left++;
        if (across(right, a.x, b.x)) out.right++;
      }
    }
  }
  return out;
}

// Whether `inner` sits somewhere inside the group `outer`.
function nestedIn(cnodes: CNode[], inner: number, outer: number): boolean {
  const seen = new Set<number>();
  for (let p = cnodes[inner]!.parent; p >= 0 && !seen.has(p); p = cnodes[p]!.parent) {
    if (p === outer) return true;
    seen.add(p);
  }
  return false;
}

// On the grid, a group with an edge to one of its own members gets a row more at the top, so the
// edge has a cell between the group's border and the member (it runs down from the border).
export function roomForMembers(
  grid: number,
  cnodes: CNode[],
  ends: readonly (readonly [number, number])[]
): void {
  const done = new Set<number>();
  const within = (inner: number, outer: number): boolean => nestedIn(cnodes, inner, outer);
  for (const [a, b] of ends) {
    for (const [g, m] of [
      [a, b],
      [b, a],
    ] as const) {
      if (!cnodes[g]!.isGroup || done.has(g) || !within(m, g)) continue;
      cnodes[g]!.padTop += grid;
      done.add(g);
    }
  }
}

// Whether one of the two sits somewhere inside the other (an edge between a group and one of its
// own members).
export function isOwnEdge(cnodes: CNode[], a: number, b: number): boolean {
  return nestedIn(cnodes, a, b) || nestedIn(cnodes, b, a);
}

// A route on the grid, in cells: each end moves half a cell out of its box, onto the cell just
// outside its side, and points that repeat or sit midway along a straight run are dropped.
export function ontoCells(grid: number, points: RoutePoint[], from: Side, to: Side): RoutePoint[] {
  if (points.length === 0) return points;
  const out = (p: RoutePoint, side: Side): RoutePoint => {
    const h = grid / 2;
    if (side === 'top') return { ...p, y: p.y - h };
    if (side === 'bottom') return { ...p, y: p.y + h };
    if (side === 'left') return { ...p, x: p.x - h };
    return { ...p, x: p.x + h };
  };
  const pts = points.map((p) => ({ ...p }));
  pts[0] = out(pts[0]!, from);
  pts[pts.length - 1] = out(pts[pts.length - 1]!, to);
  const kept: RoutePoint[] = [];
  for (const p of pts) {
    const last = kept[kept.length - 1];
    if (last && last.x === p.x && last.y === p.y) continue;
    const before = kept[kept.length - 2];
    if (
      last &&
      before &&
      ((before.x === last.x && last.x === p.x) || (before.y === last.y && last.y === p.y))
    )
      kept.pop();
    kept.push(p);
  }
  if (kept.length === 1) kept.push({ ...kept[0]! });
  return kept;
}

// A self-loop on the grid, in cells (research/ascii-snapping.md §6): out of one side and back
// into it two cells further along, so the box needs room for two ends there (D140). Beside the
// node across the flow, `loop` cells out; its label sits `loopGap` past the loop.
export function gridLoop(
  grid: number,
  b: LayoutModelNode,
  below: boolean,
  label: { width: number; height: number } | undefined,
  M: LayoutMetrics,
  { nth, count }: { nth: number; count: number }
): LayoutModelEdge {
  const pitch = Math.max(grid, edgeOn(M.portPitch, grid));
  const left = b.x - b.width / 2 + grid / 2;
  const top = b.y - b.height / 2 + grid / 2;
  const right = left + b.width - grid;
  const bottom = top + b.height - grid;
  // The `nth` of `count` pairs of cells, all `pitch` apart, around the middle of a side and off
  // its corners (the side has grown to hold them, D140).
  const pair = (lo: number, hi: number): [number, number] => {
    const first = Math.max(lo + grid, floorTo((lo + hi - (2 * count - 1) * pitch) / 2, grid));
    const a = Math.min(hi - grid, first + 2 * nth * pitch);
    return [a, Math.min(hi - grid, a + pitch)];
  };
  const reach = Math.max(grid, edgeOn(M.loop, grid)) - grid;
  const gap = edgeOn(M.loopGap, grid);
  if (below) {
    const [x0, x1] = pair(left, right);
    const y = bottom + grid;
    const out = y + reach;
    const placed: LayoutModelEdge = {
      points: [
        { x: x0, y, axis: 'v' },
        { x: x0, y: out, axis: 'v' },
        { x: x1, y: out, axis: 'h' },
        { x: x1, y, axis: 'v' },
      ],
      ports: { source: 'bottom', target: 'bottom' },
    };
    if (label) {
      const l = left + floorTo((b.width - label.width) / 2, grid);
      placed.label = {
        x: l + label.width / 2 - grid / 2,
        y: out + grid + gap + label.height / 2 - grid / 2,
      };
    }
    return placed;
  }
  const [y0, y1] = pair(top, bottom);
  const x = right + grid;
  const out = x + reach;
  const placed: LayoutModelEdge = {
    points: [
      { x, y: y0, axis: 'h' },
      { x: out, y: y0, axis: 'h' },
      { x: out, y: y1, axis: 'v' },
      { x, y: y1, axis: 'h' },
    ],
    ports: { source: 'right', target: 'right' },
  };
  if (label) {
    const t = floorTo((y0 + y1 + grid - label.height) / 2, grid);
    placed.label = {
      x: out + grid + gap + label.width / 2 - grid / 2,
      y: t + label.height / 2 - grid / 2,
    };
  }
  return placed;
}
