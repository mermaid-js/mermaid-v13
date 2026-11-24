// The `layered` engine: LayoutGraph → LayoutModel over the compound layout ported from Pele
// (https://github.com/obsidianmd/pele, MIT, (c) 2026 kepano; see THIRD_PARTY_NOTICES). The
// `availableWidth` handling follows Pele's src/diagrams/common/fit-width.ts (`tighten`, then
// `turnToFit`), applied to the layout instead of to a whole render.
// cspell:ignore kepano cnode cnodes cedges
import type {
  Dir,
  LayoutContext,
  LayoutEdge,
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
import { hits, markerRect, rectOf, type Rect } from './end-markers.ts';
import { gridHooks, type GridHooks } from './grid.ts';
import { gridObstacles, type GridBorders } from './grid-obstacles.ts';
import type { LayeredOptions } from './layered.ts';
import { honourSides, OUTWARD } from './sides.ts';
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
    if (n.anchorY !== undefined) finite(n.anchorY, `anchorY of node '${n.id}'`);
    if (n.anchorY! > n.height)
      throw new RangeError(`layout: anchorY of node '${n.id}' lies below its box`);
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

// Lays out the graph, in grid mode growing the sides that have too many ends, and places the
// edge-end labels.
function grown(graph: LayoutGraph, dir: Dir, tight: boolean): LayoutModel {
  const hooks = gridHooks(graph.grid);
  const first = run(graph, dir, tight, hooks);
  if (!hooks) return endLabels(graph, first, 0);
  const done = hooks.grow(graph, first, (g) => run(g, dir, tight, hooks));
  return endLabels(done.graph, done.model, hooks.cell);
}

// The engine's edge for `e` from item `src` to `dst`: its label's size, the ends with a head
// (D682), and its end labels with the room before each, `gap` past a middle label (D607).
function toCEdge(graph: LayoutGraph, e: LayoutEdge, src: number, dst: number, gap: number): CEdge {
  const ce: CEdge = {
    src,
    dst,
    minlen: Math.max(1, Math.round(e.minLen)),
    labelW: e.label?.width ?? 0,
    labelH: e.label?.height ?? 0,
    route: [],
    labelX: 0,
    labelY: 0,
  };
  if (e.heads) ce.heads = +e.heads.target | (2 * +e.heads.source);
  if (e.startLabel) ce.start = { ...e.startLabel, along: before(graph, e, false) + gap };
  if (e.endLabel) ce.end = { ...e.endLabel, along: before(graph, e, true) + gap };
  return ce;
}

// The room along an edge before an end label (D102): `endLabelAlong` past the end's own marker,
// and at the target past `headRoom` where that is longer (D607).
function before(graph: LayoutGraph, e: LayoutEdge, head: boolean): number {
  const marker = (head ? e.endMarker : e.startMarker)?.length ?? 0;
  return (
    (graph.metrics ?? pxProfile.engine).endLabelAlong +
    Math.max(marker, head ? (graph.headRoom ?? 0) : 0)
  );
}

// A group's title (`titlePosition`): `bottom-…` puts it and its room below the content, `…-left`
// and `…-right` at that side. Sets the group's padding above and below (`padTop`, `padBottom`,
// already scaled) with the title's height and the frame's `cell`, and returns the padding the title sits in.
function titleBand(
  g: LayoutGraph['groups'][number],
  c: CNode,
  padTop: number,
  padBottom: number,
  cell: number
): number {
  const at = g.titlePosition ?? '';
  const titleH = g.title?.height ?? 0;
  c.titleLow = at.startsWith('b');
  c.titleSide = at.endsWith('left') ? -1 : Number(at.endsWith('right'));
  c.padTop = padTop + (c.titleLow ? 0 : titleH) + cell;
  c.padBottom = padBottom + (c.titleLow ? titleH : 0) + cell;
  return c.titleLow ? padBottom : padTop;
}

// The groups as laid out. The title sits midway down the padding of its side (`bands`), in the
// middle or `padX` in from the side it is at. Each group's model is also added to `boxes`, in the
// order of the groups.
function groupModels(
  graph: LayoutGraph,
  cgroups: CNode[],
  bands: number[],
  pad: number,
  boxes: LayoutModelNode[]
): Map<string, LayoutModelGroup> {
  const groups = new Map<string, LayoutModelGroup>();
  graph.groups.forEach((g, j) => {
    const c = cgroups[j]!;
    const x = c.x + pad;
    const y = c.y + pad;
    const { width = 0, height = 0 } = g.title ?? {};
    const title = {
      x: x + c.titleSide * (c.w / 2 - c.padX - width / 2),
      y: y + (c.titleLow ? 1 : -1) * (c.h / 2 - bands[j]! / 2 - height / 2),
    };
    const b = { x, y, width: c.w, height: c.h, title };
    groups.set(g.id, b);
    boxes.push(b);
  });
  return groups;
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

// The direction of the nearest group around node `i` that names one.
function directionOf(cnodes: CNode[], i: number): Dir | undefined {
  let dir: Dir | undefined;
  // At most one step per node: a cycle of parents ends the search as a repeat would.
  for (
    let p = cnodes[i]!.parent, steps = 0;
    p >= 0 && dir === undefined && steps < cnodes.length;
    p = cnodes[p]!.parent, steps++
  )
    dir = cnodes[p]!.dir;
  return dir;
}

function run(graph: LayoutGraph, rootDir: Dir, tight: boolean, hooks?: GridHooks): LayoutModel {
  const M = graph.metrics ?? pxProfile.engine;
  // A length scaled for a tight layout; on the grid it stays a whole multiple of the cell.
  const scaled = (v: number, scale: number): number =>
    hooks && scale !== 1 ? hooks.scale(v, scale) : v * scale;
  // The room the frame of a group takes on the grid, and the margin the cells are counted from.
  const cell = hooks?.cell ?? 0;
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
  // Pele places the title in the top padding: half of `padding.top` above it, half below. A
  // title at the bottom sits in the bottom padding the same way.
  const bands: number[] = [];
  graph.groups.forEach((g, j) => {
    index.set(g.id, nodeCount + j);
    const c = cnode(0, 0);
    c.isGroup = true;
    c.dir = g.direction;
    // On the grid the frame takes a cell of its own, and the padding is blank cells inside it.
    c.padX = scaled(Math.max(g.padding.left, g.padding.right), padScale) + cell;
    const padBottom = scaled(g.padding.bottom, padScale);
    bands.push(titleBand(g, c, scaled(g.padding.top, padScale), padBottom, cell));
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
  hooks?.roomForMembers(cnodes, ends);
  inheritCrossedDirections(cnodes, ends);

  const sideways = (i: number): boolean => runsAcross(directionOf(cnodes, i) ?? rootDir);
  graph.nodes.forEach((n, i) => {
    const across = sideways(i) ? n.height : n.width;
    cnodes[i]!.span = n.span ?? Math.max(0, across - 2 * M.corner);
  });

  // A self-loop sits beside its node, across the flow; the box laid out grows to hold it.
  // How many self-loops each node has, and how many have been placed: on the grid each takes
  // its own pair of cells along the side. Off the grid, how far out the loops already placed on
  // each side of a node reach (#768). Made at the first loop.
  let loopSide: Uint8Array | undefined;
  let loopCount: Int32Array | undefined;
  let loopsSeen: Int32Array | undefined;
  let loopUsed: Float64Array | undefined;
  const cedges: CEdge[] = graph.edges.map((e, k) => {
    const [src, dst] = ends[k]!;
    const labelW = e.label?.width ?? 0;
    const labelH = e.label?.height ?? 0;
    // An end label next to a middle label keeps `endLabelAlong` from it too (D607).
    const gap = e.label ? M.endLabelAlong : 0;
    if (src === dst) {
      if (!loopCount) {
        loopSide = new Uint8Array(cnodes.length);
        loopCount = new Int32Array(cnodes.length);
        loopsSeen = new Int32Array(cnodes.length);
        loopUsed = new Float64Array(2 * cnodes.length);
      }
      loopCount[src]!++;
      const below = sideways(src);
      reserveLoop(
        cnodes[src]!,
        below,
        below ? labelH : labelW,
        src >= nodeCount || hooks !== undefined,
        M
      );
      loopSide![src] = below ? 2 : 1;
    }
    return toCEdge(graph, e, src, dst, gap);
  });

  const routing = graph.routing ?? 'curved';
  const opt: LayeredOptions = {
    nodeSep: scaled(graph.spacing.node, tight ? TIGHT_NODE : 1),
    edgeSep: graph.spacing.edge,
    rankSep: scaled(graph.spacing.rank, tight ? TIGHT_RANK : 1),
    portSep: M.portSep,
    // On the grid every edge runs at right angles on tracks, whatever routing asks (D78).
    tracks: routing === 'stepped' || hooks !== undefined,
    straight: routing === 'straight' && !hooks,
    headRoom: graph.headRoom ?? 0,
    metrics: M,
    ...(hooks ? { grid: hooks } : {}),
  };
  const total = compoundLayout(cnodes, cedges, rootDir, opt);

  const margin = hooks ? Math.ceil(graph.diagramPadding ?? 0) : (graph.diagramPadding ?? 0);
  const pad = margin - cell / 2; // on the grid, a coordinate is a cell index (D78)
  const nodes = new Map<string, LayoutModelNode>();
  // The boxes of the nodes, then the groups, by index, for reading only.
  const boxes: LayoutModelNode[] = [];
  graph.nodes.forEach((n, i) => {
    const c = cnodes[i]!;
    nodes.set(n.id, (boxes[i] = { x: c.x + pad, y: c.y + pad, width: n.width, height: n.height }));
  });
  const groups = groupModels(graph, cnodes.slice(nodeCount), bands, pad, boxes);

  const edges = new Map<string, LayoutModelEdge>();
  graph.edges.forEach((e, k) => {
    const ce = cedges[k]!;
    const [src, dst] = ends[k]!;
    if (src === dst) {
      const nth = loopsSeen![src]!++;
      const slot = { nth, count: loopCount![src]! };
      const below = loopSide![src] === 2;
      edges.set(
        e.id,
        hooks
          ? hooks.loop(boxes[src]!, below, e.label, M, slot)
          : selfLoop(boxes[src]!, below, e.label, M, nth, loopUsed!.subarray(2 * src))
      );
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
    const own = hooks?.isOwnEdge(cnodes, src, dst) === true;
    const source = own ? 'top' : sideOf(boxes[src]!, points[0], flowEnd(rootDir));
    const target = own ? 'top' : sideOf(boxes[dst]!, points[points.length - 1], flowStart(rootDir));
    const model: LayoutModelEdge = {
      points: hooks ? hooks.ontoCells(points, source, target) : points,
      ports: { source, target },
    };
    if (ce.labelW > 0 || ce.labelH > 0) model.label = { x: ce.labelX + pad, y: ce.labelY + pad };
    edges.set(e.id, model);
  });

  const laid: LayoutModel = {
    width: total.width + 2 * margin,
    height: total.height + 2 * margin,
    nodes,
    edges,
    groups,
    direction: rootDir,
  };
  return hooks ? laid : honourSides(graph, laid, M, index, margin); // sides are hints (D503)
}

// Edge-end labels (D102), placed once the routes are final: each sits beside the segment that
// leaves its end's side, `endLabelAlong` out past its end's own marker (the target's at least
// past the arrowhead's room, D607) and `endLabelAcross` off the line, on the side of the line the
// route does not turn towards. Where that would cover a label already placed (any edge's middle label, or an end
// label placed before it, or any edge's end marker, `LayoutEdge.startMarker`) it takes the other side, and where both would, it moves further out
// along the segment on whichever side needs less, past what is in the way. It never moves onto a
// node or a group's title. On the grid all of it is whole cells: the label starts in the row or
// column `along` cells past the end cell, `across` blank cells off the line, and it also moves
// past every route's end cell and every group border row (column) it would cover.
function endLabels(graph: LayoutGraph, model: LayoutModel, grid: number): LayoutModel {
  if (!graph.edges.some((e) => e.startLabel ?? e.endLabel)) return model;
  const M = graph.metrics ?? pxProfile.engine;
  const walls: Rect[] = [...model.nodes.values()].map((b) => rectOf(b, b));
  for (const g of graph.groups) {
    const placed = model.groups.get(g.id);
    if (g.title && placed) walls.push(rectOf(placed.title, g.title));
  }
  const taken: Rect[] = [];
  for (const e of graph.edges) {
    const placed = model.edges.get(e.id);
    if (e.label && placed?.label) taken.push(rectOf(placed.label, e.label));
    if (!placed || placed.points.length < 2) continue;
    const { points, ports } = placed;
    const straight = graph.routing === 'straight';
    if (e.startMarker)
      taken.push(markerRect(points, OUTWARD[ports.source], e.startMarker, straight));
    if (e.endMarker)
      taken.push(markerRect([...points].reverse(), OUTWARD[ports.target], e.endMarker, straight));
  }
  const { ends, ...borders } = gridObstacles(model, grid);
  taken.push(...ends);
  const around = { walls, taken, borders };
  const across = M.endLabelAcross;
  for (const e of graph.edges) {
    if (!e.startLabel && !e.endLabel) continue;
    const placed = model.edges.get(e.id);
    if (!placed || placed.points.length === 0) continue;
    const { points, ports } = placed;
    if (e.startLabel) {
      const room = { along: before(graph, e, false), across, grid };
      const at = endLabelAt(points, ports.source, e.startLabel, room, around);
      placed.startLabel = at;
      taken.push(rectOf(at, e.startLabel));
    }
    if (e.endLabel) {
      const back = [...points].reverse();
      const head = { along: before(graph, e, true), across, grid };
      const at = endLabelAt(back, ports.target, e.endLabel, head, around);
      placed.endLabel = at;
      taken.push(rectOf(at, e.endLabel));
    }
  }
  return model;
}

// The centre of a label of `size` at the end `points[0]`, whose route leaves through `side`,
// clear of `walls` (nodes, titles), of the labels `taken` and of the group `borders` it moves
// across.
function endLabelAt(
  points: readonly RoutePoint[],
  side: Side,
  size: { width: number; height: number },
  { along, across, grid }: { along: number; across: number; grid: number },
  obstacles: { walls: readonly Rect[]; taken: readonly Rect[]; borders: GridBorders }
): Point {
  const { walls, borders } = obstacles;
  const p = points[0]!;
  const { axis, sign } = OUTWARD[side];
  const taken = [...obstacles.taken, ...(axis === 'y' ? borders.rows : borders.columns)];
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
  const at = (away: number, push: number): Point => {
    const out = p[axis] + sign * (along + push + deep / 2 - grid / 2);
    const off = p[cross] + away * (grid / 2 + across + wide / 2);
    return axis === 'x' ? { x: out, y: off } : { x: off, y: out };
  };
  // How far out along the segment the label must move on side `away` to clear the labels in
  // its way, or undefined where that runs into a wall.
  const pushFor = (away: number): number | undefined => {
    let push = 0;
    for (let tries = 0; tries <= taken.length; tries++) {
      const r = rectOf(at(away, push), size);
      if (walls.some((w) => hits(r, w))) return undefined;
      const hit = taken.find((t) => hits(r, t));
      if (!hit) return push;
      const lo = axis === 'x' ? 'x0' : 'y0';
      const hi = axis === 'x' ? 'x1' : 'y1';
      const by = sign > 0 ? hit[hi] - r[lo] : r[hi] - hit[lo];
      push += grid ? Math.ceil(by / grid - 1e-9) * grid : by;
    }
    return undefined;
  };
  const first = lean > 0 ? -1 : 1;
  const a = pushFor(first);
  const b = pushFor(-first);
  if (a !== undefined && (b === undefined || a <= b)) return at(first, a);
  if (b !== undefined) return at(-first, b);
  return at(first, 0);
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

// A loop out of one side of a node and back, beside it across the flow. The node's loops take
// its two sides in turn (#768, D618): the `nth` takes the far side when `nth` is odd, and starts
// past the loops already on that side, which `used` holds for the near and far side and this
// one adds to (in reserveLoop's room). Its ends spread towards the corners, so it never runs
// along an inner one.
function selfLoop(
  b: LayoutModelNode,
  below: boolean,
  label: { width: number; height: number } | undefined,
  M: LayoutMetrics,
  nth: number,
  used: Float64Array
): LayoutModelEdge {
  const i = nth & 1;
  const s = 1 - 2 * i;
  const off = used[i]!;
  const size = below ? label?.height : label?.width;
  used[i] = off + M.loop + (size ? size + M.loopGap : 0);
  const f = 0.5 - 0.25 / ((nth >> 1) + 1);
  if (below) {
    const y = b.y + (s * b.height) / 2;
    const out = y + s * (off + M.loop);
    const x0 = b.x - b.width * f;
    const x1 = b.x + b.width * f;
    return {
      points: [
        { x: x0, y, axis: 'v' },
        { x: x0, y: out, axis: 'v' },
        { x: x1, y: out, axis: 'h' },
        { x: x1, y, axis: 'v' },
      ],
      ...(label ? { label: { x: b.x, y: out + s * M.loopGap + (s * label.height) / 2 } } : {}),
      ports: s > 0 ? { source: 'bottom', target: 'bottom' } : { source: 'top', target: 'top' },
    };
  }
  const x = b.x + (s * b.width) / 2;
  const out = x + s * (off + M.loop);
  const y0 = b.y - b.height * f;
  const y1 = b.y + b.height * f;
  return {
    points: [
      { x, y: y0, axis: 'h' },
      { x: out, y: y0, axis: 'h' },
      { x: out, y: y1, axis: 'v' },
      { x, y: y1, axis: 'h' },
    ],
    ...(label ? { label: { x: out + s * M.loopGap + (s * label.width) / 2, y: b.y } } : {}),
    ports: s > 0 ? { source: 'right', target: 'right' } : { source: 'left', target: 'left' },
  };
}
