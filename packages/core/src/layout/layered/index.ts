// The `layered` engine: LayoutGraph → LayoutModel over the compound layout ported from Pele
// (https://github.com/obsidianmd/pele, MIT, (c) 2026 kepano; see THIRD_PARTY_NOTICES). The
// `availableWidth` handling follows Pele's src/diagrams/common/fit-width.ts (`tighten`, then
// `turnToFit`), applied to the layout instead of to a whole render.
// cspell:ignore kepano cnode cnodes cedges
import type {
  Dir,
  LayoutContext,
  LayoutEngine,
  LayoutGraph,
  LayoutModel,
  LayoutModelEdge,
  LayoutModelGroup,
  LayoutModelNode,
  Point,
  RoutePoint,
  Side,
} from '../types.ts';
import {
  cnode,
  compoundLayout,
  inheritCrossedDirections,
  type CEdge,
  type CNode,
} from './compound.ts';
import { edgeOn, floorTo, type LayeredOptions } from './layered.ts';
import { pxProfile, type LayoutMetrics } from '../units.ts';

// Length constants (port and loop sizes, corners, the turn breakpoint) come from
// `graph.metrics`, or the px profile's when absent (D77).
/** The px profile's turn breakpoint: an across drawing turns only when the budget is under it. */
export const TURN_BREAKPOINT = pxProfile.engine.turnBreakpoint;
// Tight layouts (`availableWidth`): node and rank spacing and group padding are scaled by these.
const TIGHT_NODE = 0.5;
const TIGHT_RANK = 0.75;
const TIGHT_PAD = 0.6;

/** The spacing keys of a diagram's resolved config (flowchart: `nodeSpacing`, …). */
export interface SpacingConfig {
  nodeSpacing?: number;
  rankSpacing?: number;
  diagramPadding?: number;
}

/** v12's defaults (R-LAYOUT-6). v12 sets no edge spacing, so dagre's 20 applies. */
export const V12_SPACING = {
  nodeSpacing: 50,
  rankSpacing: 50,
  edgeSpacing: 20,
  diagramPadding: 8,
} as const;

/** The LayoutGraph spacing fields for a diagram's resolved config, with v12 defaults. */
export function layoutSettings(config: SpacingConfig = {}): {
  spacing: LayoutGraph['spacing'];
  diagramPadding: number;
} {
  return {
    spacing: {
      node: config.nodeSpacing ?? V12_SPACING.nodeSpacing,
      rank: config.rankSpacing ?? V12_SPACING.rankSpacing,
      edge: V12_SPACING.edgeSpacing,
    },
    diagramPadding: config.diagramPadding ?? V12_SPACING.diagramPadding,
  };
}

export const layered: LayoutEngine = (graph: LayoutGraph, ctx?: LayoutContext): LayoutModel => {
  void ctx;
  check(graph);
  const M = graph.metrics ?? pxProfile.engine;
  const available = graph.availableWidth;
  const across = tighten(graph, graph.direction);
  if (available === undefined || !(available > 0) || across.width <= available) return across;
  if (!runsAcross(graph.direction) || available >= M.turnBreakpoint) return across;
  const turned = graph.turnedSpacing ? { ...graph, spacing: graph.turnedSpacing } : graph;
  const down = tighten(turned, 'TB');
  return down.width < across.width ? down : across;
};

function runsAcross(dir: Dir): boolean {
  return dir === 'LR' || dir === 'RL';
}

// Lays out with room to spare, and tightly instead when that does not fit and tight is narrower.
function tighten(graph: LayoutGraph, dir: Dir): LayoutModel {
  const loose = grown(graph, dir, false);
  const available = graph.availableWidth;
  if (available === undefined || !(available > 0) || loose.width <= available) return loose;
  const tight = grown(graph, dir, true);
  return tight.width < loose.width ? tight : loose;
}

function finite(value: number, what: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`layout: ${what} must be a finite number >= 0, got ${value}`);
  }
}

function check(graph: LayoutGraph): void {
  const ids = new Set<string>();
  const add = (id: string, what: string): void => {
    if (ids.has(id)) throw new Error(`layout: duplicate ${what} id '${id}'`);
    ids.add(id);
  };
  for (const n of graph.nodes) {
    add(n.id, 'node');
    finite(n.width, `width of node '${n.id}'`);
    finite(n.height, `height of node '${n.id}'`);
    if (n.span !== undefined) finite(n.span, `span of node '${n.id}'`);
  }
  for (const g of graph.groups) {
    add(g.id, 'group');
    const { top, right, bottom, left } = g.padding;
    for (const v of [top, right, bottom, left]) finite(v, `padding of group '${g.id}'`);
    if (g.title) {
      finite(g.title.width, `title width of group '${g.id}'`);
      finite(g.title.height, `title height of group '${g.id}'`);
    }
  }
  const edges = new Set<string>();
  for (const e of graph.edges) {
    if (edges.has(e.id)) throw new Error(`layout: duplicate edge id '${e.id}'`);
    edges.add(e.id);
    if (!ids.has(e.source))
      throw new Error(`layout: edge '${e.id}' has unknown source '${e.source}'`);
    if (!ids.has(e.target))
      throw new Error(`layout: edge '${e.id}' has unknown target '${e.target}'`);
    finite(e.minLen, `minLen of edge '${e.id}'`);
    if (e.label) {
      finite(e.label.width, `label width of edge '${e.id}'`);
      finite(e.label.height, `label height of edge '${e.id}'`);
    }
  }
  const { node, rank, edge } = graph.spacing;
  finite(node, 'spacing.node');
  finite(rank, 'spacing.rank');
  finite(edge, 'spacing.edge');
  if (graph.diagramPadding !== undefined) finite(graph.diagramPadding, 'diagramPadding');
  if (graph.headRoom !== undefined) finite(graph.headRoom, 'headRoom');
  // Only character cells: box sizes are whole cells, so a coarser quantum cannot hold them.
  if (graph.grid !== undefined && graph.grid !== 1)
    throw new RangeError(`layout: grid must be 1 (character cells), got ${graph.grid}`);
}

function gridOf(graph: LayoutGraph): number {
  return graph.grid !== undefined && graph.grid > 0 ? graph.grid : 0;
}

// The room `k` edge ends take along one side on the grid: a cell each, `portPitch` apart, and
// clear of both corners (D140).
function sideRoom(k: number, pitch: number, grid: number): number {
  return (k - 1) * pitch + 3 * grid;
}

// In grid mode every edge end gets a cell of its own on its side (D140). A side with more ends
// than it has room for grows (wider for top and bottom, taller for left and right), and the
// layout runs again with the grown boxes, which the model reports. Ends are never bundled.
function grown(graph: LayoutGraph, dir: Dir, tight: boolean): LayoutModel {
  const grid = gridOf(graph);
  let model = run(graph, dir, tight);
  if (!grid) return endLabels(graph, model, grid);
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
    model = run(current, dir, tight);
  }
  placeTitles(current, model, grid);
  return endLabels(current, model, grid);
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

// The groups as laid out; the title sits midway down the top padding.
function groupModels(
  graph: LayoutGraph,
  cgroups: CNode[],
  padTops: number[],
  pad: number
): Map<string, LayoutModelGroup> {
  const groups = new Map<string, LayoutModelGroup>();
  graph.groups.forEach((g, j) => {
    const c = cgroups[j]!;
    const x = c.x + pad;
    const y = c.y + pad;
    const top = y - c.h / 2;
    const titleY = top + padTops[j]! / 2 + (g.title?.height ?? 0) / 2;
    groups.set(g.id, { x, y, width: c.w, height: c.h, title: { x, y: titleY } });
  });
  return groups;
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
function roomForMembers(
  cnodes: CNode[],
  ends: readonly (readonly [number, number])[],
  grid: number
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

// A self-loop sits beside its node, across the flow; the room laid out for the node grows to hold
// it. `round` keeps the box's own size and puts the room round it (`loopW/H`): groups always, so
// the loop stays inside their parent, and every node on the grid, so ports and edges from its
// group see the box itself.
function reserveLoop(c: CNode, below: boolean, label: number, round: boolean, M: LayoutMetrics) {
  const room = 2 * (M.loop + (label > 0 ? label + M.loopGap : 0));
  if (below && round) c.loopH += room;
  else if (below) c.h += room;
  else if (round) c.loopW += room;
  else c.w += room;
}

// A length scaled for a tight layout; on the grid it stays a whole multiple of it.
function scaleOn(v: number, scale: number, grid: number): number {
  return grid && scale !== 1 ? Math.max(grid, edgeOn(v * scale, grid)) : v * scale;
}

function run(graph: LayoutGraph, rootDir: Dir, tight: boolean): LayoutModel {
  const M = graph.metrics ?? pxProfile.engine;
  const grid = gridOf(graph);
  const scaled = (v: number, scale: number): number => scaleOn(v, scale, grid);
  const padScale = tight ? TIGHT_PAD : 1;
  const nodeCount = graph.nodes.length;
  const index = new Map<string, number>();
  const cnodes: CNode[] = [];
  graph.nodes.forEach((n, i) => {
    index.set(n.id, i);
    const c = cnode(n.width, n.height);
    c.seq = i;
    cnodes.push(c);
  });
  // Pele places the title in the top padding: half of `padding.top` above it, half below.
  const padTops: number[] = [];
  graph.groups.forEach((g, j) => {
    index.set(g.id, nodeCount + j);
    const c = cnode(0, 0);
    c.isGroup = true;
    c.dir = g.direction;
    // On the grid the frame takes a cell of its own, and the padding is blank cells inside it.
    c.padX = scaled(Math.max(g.padding.left, g.padding.right), padScale) + grid;
    const padTop = scaled(g.padding.top, padScale);
    padTops.push(padTop);
    c.padTop = padTop + (g.title?.height ?? 0) + grid;
    c.padBottom = scaled(g.padding.bottom, padScale) + grid;
    c.minW = (g.title?.width ?? 0) + 2 * c.padX;
    c.seq = nodeCount + j;
    c.span = Infinity;
    cnodes.push(c);
  });
  const parentOf = (id: string | undefined): number => {
    if (id === undefined) return -1;
    const p = index.get(id);
    return p !== undefined && p >= nodeCount ? p : -1;
  };
  graph.nodes.forEach((n, i) => (cnodes[i]!.parent = parentOf(n.parent)));
  graph.groups.forEach((g, j) => (cnodes[nodeCount + j]!.parent = parentOf(g.parent)));

  const ends = graph.edges.map((e) => [index.get(e.source)!, index.get(e.target)!] as const);
  if (grid) roomForMembers(cnodes, ends, grid);
  inheritCrossedDirections(cnodes, ends);

  const sideways = (i: number): boolean => {
    let dir: Dir | undefined;
    const seen = new Set<number>();
    for (
      let p = cnodes[i]!.parent;
      p >= 0 && dir === undefined && !seen.has(p);
      p = cnodes[p]!.parent
    ) {
      seen.add(p);
      dir = cnodes[p]!.dir;
    }
    return runsAcross(dir ?? rootDir);
  };
  graph.nodes.forEach((n, i) => {
    const across = sideways(i) ? n.height : n.width;
    cnodes[i]!.span = n.span ?? Math.max(0, across - 2 * M.corner);
  });

  // A self-loop sits beside its node, across the flow; the box laid out grows to hold it.
  const loopSide = new Uint8Array(cnodes.length);
  // How many self-loops each node has, and how many have been placed: on the grid each takes
  // its own pair of cells along the side.
  const loopCount = new Int32Array(cnodes.length);
  const loopsSeen = new Int32Array(cnodes.length);
  const cedges: CEdge[] = graph.edges.map((e, k) => {
    const [src, dst] = ends[k]!;
    const labelW = e.label?.width ?? 0;
    const labelH = e.label?.height ?? 0;
    if (src === dst) loopCount[src]!++;
    if (src === dst && (src < nodeCount || grid)) {
      const below = sideways(src);
      reserveLoop(cnodes[src]!, below, below ? labelH : labelW, src >= nodeCount || grid > 0, M);
      loopSide[src] = below ? 2 : 1;
    }
    return {
      src,
      dst,
      minlen: Math.max(1, Math.round(e.minLen)),
      labelW,
      labelH,
      ...(e.startLabel ? { start: e.startLabel } : {}),
      ...(e.endLabel ? { end: e.endLabel } : {}),
      route: [],
      labelX: 0,
      labelY: 0,
    };
  });

  const routing = graph.routing ?? 'curved';
  const opt: LayeredOptions = {
    nodeSep: scaled(graph.spacing.node, tight ? TIGHT_NODE : 1),
    edgeSep: graph.spacing.edge,
    rankSep: scaled(graph.spacing.rank, tight ? TIGHT_RANK : 1),
    portSep: M.portSep,
    // On the grid every edge runs at right angles on tracks, whatever routing asks (D78).
    tracks: routing === 'stepped' || grid > 0,
    straight: routing === 'straight' && !grid,
    headRoom: graph.headRoom ?? 0,
    metrics: M,
    ...(grid ? { grid } : {}),
  };
  const total = compoundLayout(cnodes, cedges, rootDir, opt);

  const margin = grid ? Math.ceil(graph.diagramPadding ?? 0) : (graph.diagramPadding ?? 0);
  const pad = margin - grid / 2; // on the grid, a coordinate is a cell index (D78)
  const nodes = new Map<string, LayoutModelNode>();
  graph.nodes.forEach((n, i) => {
    const c = cnodes[i]!;
    nodes.set(n.id, { x: c.x + pad, y: c.y + pad, width: n.width, height: n.height });
  });
  const groups = groupModels(graph, cnodes.slice(nodeCount), padTops, pad);

  const box = (i: number): LayoutModelNode => {
    const c = cnodes[i]!;
    const size = i < nodeCount ? graph.nodes[i]! : { width: c.w, height: c.h };
    return { x: c.x + pad, y: c.y + pad, width: size.width, height: size.height };
  };
  const edges = new Map<string, LayoutModelEdge>();
  graph.edges.forEach((e, k) => {
    const ce = cedges[k]!;
    const [src, dst] = ends[k]!;
    if (src === dst) {
      const loop = grid ? gridLoop : selfLoop;
      const nth = loopsSeen[src]!++;
      const slot = { nth, count: loopCount[src]! };
      edges.set(e.id, loop(box(src), loopSide[src] === 2, e.label, M, grid, slot));
      return;
    }
    const points: RoutePoint[] = [];
    for (let p = 0; p + 2 < ce.route.length; p += 3) {
      points.push({
        x: ce.route[p]! + pad,
        y: ce.route[p + 1]! + pad,
        axis: ce.route[p + 2] === 1 ? 'h' : 'v',
      });
    }
    // On the grid an edge between a group and its own member runs down from the group's top
    // border into the member's top (compound.ts), whatever side the ends lie nearest.
    const own = grid > 0 && (nestedIn(cnodes, src, dst) || nestedIn(cnodes, dst, src));
    const source = own ? 'top' : sideOf(box(src), points[0], flowEnd(rootDir));
    const target = own ? 'top' : sideOf(box(dst), points[points.length - 1], flowStart(rootDir));
    const model: LayoutModelEdge = {
      points: grid ? ontoCells(points, source, target, grid) : points,
      ports: { source, target },
    };
    if (ce.labelW > 0 || ce.labelH > 0) model.label = { x: ce.labelX + pad, y: ce.labelY + pad };
    edges.set(e.id, model);
  });

  return {
    width: total.width + 2 * margin,
    height: total.height + 2 * margin,
    nodes,
    edges,
    groups,
    direction: rootDir,
  };
}

// The axis a side faces along, and which way is out of the box.
const OUTWARD: Readonly<Record<Side, { axis: 'x' | 'y'; sign: 1 | -1 }>> = {
  top: { axis: 'y', sign: -1 },
  bottom: { axis: 'y', sign: 1 },
  left: { axis: 'x', sign: -1 },
  right: { axis: 'x', sign: 1 },
};

// Edge-end labels (D102), placed once the routes are final: each sits beside the segment that
// leaves its end's side, `endLabelAlong` out from the side (the target's also past the
// arrowhead's room) and `endLabelAcross` off the line, on the side of the line the route does not
// turn towards, or the other side where that would cover the edge's other labels. On the grid
// both are whole cells: the label starts in the row or column `along` cells past the end cell,
// `across` blank cells off the line.
function endLabels(graph: LayoutGraph, model: LayoutModel, grid: number): LayoutModel {
  const M = graph.metrics ?? pxProfile.engine;
  const headRoom = graph.headRoom ?? 0;
  for (const e of graph.edges) {
    if (!e.startLabel && !e.endLabel) continue;
    const placed = model.edges.get(e.id);
    if (!placed || placed.points.length === 0) continue;
    const taken: Rect[] = [];
    if (e.label && placed.label) taken.push(rectOf(placed.label, e.label));
    const { points, ports } = placed;
    if (e.startLabel) {
      const room = { along: M.endLabelAlong, across: M.endLabelAcross, grid };
      const at = endLabelAt(points, ports.source, e.startLabel, room, taken);
      placed.startLabel = at;
      taken.push(rectOf(at, e.startLabel));
    }
    if (e.endLabel) {
      const back = [...points].reverse();
      const room = { along: M.endLabelAlong + headRoom, across: M.endLabelAcross, grid };
      placed.endLabel = endLabelAt(back, ports.target, e.endLabel, room, taken);
    }
  }
  return model;
}

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function rectOf(c: Point, s: { width: number; height: number }): Rect {
  return {
    x0: c.x - s.width / 2,
    y0: c.y - s.height / 2,
    x1: c.x + s.width / 2,
    y1: c.y + s.height / 2,
  };
}

// The centre of a label of `size` at the end `points[0]`, whose route leaves through `side`.
function endLabelAt(
  points: readonly RoutePoint[],
  side: Side,
  size: { width: number; height: number },
  { along, across, grid }: { along: number; across: number; grid: number },
  taken: readonly Rect[]
): Point {
  const p = points[0]!;
  const { axis, sign } = OUTWARD[side];
  const cross = axis === 'x' ? 'y' : 'x';
  let lean = 0;
  for (const q of points) {
    const d = q[cross] - p[cross];
    if (Math.abs(d) > 1e-6) {
      lean = Math.sign(d);
      break;
    }
  }
  const deep = axis === 'x' ? size.width : size.height;
  const wide = axis === 'x' ? size.height : size.width;
  const out = p[axis] + sign * (along + deep / 2 - grid / 2);
  const at = (away: number): Point => {
    const off = p[cross] + away * (grid / 2 + across + wide / 2);
    return axis === 'x' ? { x: out, y: off } : { x: off, y: out };
  };
  const first = at(lean > 0 ? -1 : 1);
  const r = rectOf(first, size);
  const clear = (o: Rect): boolean => r.x1 <= o.x0 || o.x1 <= r.x0 || r.y1 <= o.y0 || o.y1 <= r.y0;
  return taken.every(clear) ? first : at(lean > 0 ? 1 : -1);
}

const FLOW_START: Readonly<Record<Dir, Side>> = {
  TB: 'top',
  BT: 'bottom',
  LR: 'left',
  RL: 'right',
};
const FLOW_END: Readonly<Record<Dir, Side>> = { TB: 'bottom', BT: 'top', LR: 'right', RL: 'left' };

function flowStart(dir: Dir): Side {
  return FLOW_START[dir];
}

function flowEnd(dir: Dir): Side {
  return FLOW_END[dir];
}

// The side of a box that a route end lies on, or the nearest one.
function sideOf(b: LayoutModelNode, p: RoutePoint | undefined, fallback: Side): Side {
  if (!p) return fallback;
  const dx = p.x - b.x;
  const dy = p.y - b.y;
  const rx = b.width > 0 ? Math.abs(dx) / (b.width / 2) : Math.abs(dx);
  const ry = b.height > 0 ? Math.abs(dy) / (b.height / 2) : Math.abs(dy);
  if (rx < 1e-6 && ry < 1e-6) return fallback;
  if (ry >= rx) return dy < 0 ? 'top' : 'bottom';
  return dx < 0 ? 'left' : 'right';
}

// A route on the grid, in cells: each end moves half a cell out of its box, onto the cell just
// outside its side, and points that repeat or sit midway along a straight run are dropped.
function ontoCells(points: RoutePoint[], from: Side, to: Side, grid: number): RoutePoint[] {
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
function gridLoop(
  b: LayoutModelNode,
  below: boolean,
  label: { width: number; height: number } | undefined,
  M: LayoutMetrics,
  grid: number,
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

// A loop out of one side of a node and back, beside it across the flow.
function selfLoop(
  b: LayoutModelNode,
  below: boolean,
  label: { width: number; height: number } | undefined,
  M: LayoutMetrics
): LayoutModelEdge {
  if (below) {
    const y = b.y + b.height / 2;
    const out = y + M.loop;
    const x0 = b.x - b.width / 4;
    const x1 = b.x + b.width / 4;
    return {
      points: [
        { x: x0, y, axis: 'v' },
        { x: x0, y: out, axis: 'v' },
        { x: x1, y: out, axis: 'h' },
        { x: x1, y, axis: 'v' },
      ],
      ...(label ? { label: { x: b.x, y: out + M.loopGap + label.height / 2 } } : {}),
      ports: { source: 'bottom', target: 'bottom' },
    };
  }
  const x = b.x + b.width / 2;
  const out = x + M.loop;
  const y0 = b.y - b.height / 4;
  const y1 = b.y + b.height / 4;
  return {
    points: [
      { x, y: y0, axis: 'h' },
      { x: out, y: y0, axis: 'h' },
      { x: out, y: y1, axis: 'v' },
      { x, y: y1, axis: 'h' },
    ],
    ...(label ? { label: { x: out + M.loopGap + label.width / 2, y: b.y } } : {}),
    ports: { source: 'right', target: 'right' },
  };
}
