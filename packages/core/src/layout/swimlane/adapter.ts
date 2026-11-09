// The engine's edges (D532): `toLayoutData` builds the internal, mutable `LayoutData` from a
// `LayoutGraph` (groups listed last first, as v12's flowDb emits them, so the ported phases read
// lanes in source order), and `toLayoutModel` writes a `LayoutModel` back from it once the
// phases have run. Nothing else in the engine knows `LayoutGraph` or `LayoutModel`.
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
import { DEFAULT_SWIMLANE_ID, topLaneTitleBandHeight } from './helpers.ts';
import type { LayoutData, Node, SwimlaneTuning } from './layoutData.ts';
import { buildLaneModel } from './lanes.ts';
import { leftTitleBandWidth } from './direction/lrTransform.ts';
import { type PlacedBox, placeholderRoute } from './placeholderRoutes.ts';

function finite(v: number, what: string): void {
  if (!Number.isFinite(v) || v < 0)
    throw new RangeError(`layout: ${what} must be a finite number >= 0, got ${v}`);
}

/** Rejects what `tree` and `layered` reject: duplicate ids, unknown ends, bad sizes. */
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
  }
  for (const g of graph.groups) {
    add(g.id, 'group');
    for (const v of [g.padding.top, g.padding.right, g.padding.bottom, g.padding.left])
      finite(v, `padding of group '${g.id}'`);
  }
  const edges = new Set<string>();
  for (const e of graph.edges) {
    if (edges.has(e.id)) throw new Error(`layout: duplicate edge id '${e.id}'`);
    edges.add(e.id);
    if (!ids.has(e.source))
      throw new Error(`layout: edge '${e.id}' has unknown source '${e.source}'`);
    if (!ids.has(e.target))
      throw new Error(`layout: edge '${e.id}' has unknown target '${e.target}'`);
  }
}

/**
 * The internal data for `graph`. A group's v12 `padding` is its side padding; its whole padding
 * box and title size ride along for nested boxes and title bands. Spacing comes from
 * `graph.spacing`, tuning from the `swimlane` config section.
 */
export function toLayoutData(graph: LayoutGraph, tuning: SwimlaneTuning = {}): LayoutData {
  check(graph);
  const groups: Node[] = graph.groups.map((g) => ({
    id: g.id,
    isGroup: true,
    padding: Math.max(g.padding.left, g.padding.right),
    paddingBox: { ...g.padding },
    ...(g.parent === undefined ? {} : { parentId: g.parent }),
    ...(g.title ? { titleSize: { ...g.title } } : {}),
  }));
  const nodes: Node[] = graph.nodes.map((n) => ({
    id: n.id,
    isGroup: false,
    width: n.width,
    height: n.height,
    ...(n.parent === undefined ? {} : { parentId: n.parent }),
  }));
  return {
    nodes: [...groups.reverse(), ...nodes],
    edges: graph.edges.map((e) => ({
      id: e.id,
      start: e.source,
      end: e.target,
      ...(e.label ? { label: { ...e.label } } : {}),
    })),
    direction: graph.direction,
    config: {
      flowchart: { nodeSpacing: graph.spacing.node, rankSpacing: graph.spacing.rank },
      swimlane: { ...tuning },
    },
  };
}

const isPlaced = (n: Node): boolean => (n.width ?? 0) > 0 && (n.height ?? 0) > 0;

type Axis = 'x' | 'y';

/** Moves everything at or beyond `at` along `axis` on by `by`: boxes by centre, and routes. */
function shiftBeyond(data: LayoutData, axis: Axis, at: number, by: number): void {
  for (const n of data.nodes) {
    const v = n[axis];
    // An empty lane not placed yet has no size to move.
    if (v === undefined || v < at || (n.isGroup && !isPlaced(n))) continue;
    n[axis] = v + by;
    const r = n.groupTitleRect;
    if (r && axis === 'x') n.groupTitleRect = { ...r, left: r.left + by, right: r.right + by };
    if (r && axis === 'y') n.groupTitleRect = { ...r, top: r.top + by, bottom: r.bottom + by };
  }
  for (const e of data.edges) for (const p of e.points ?? []) if (p[axis] >= at) p[axis] += by;
}

/** The far side of a placed box along `axis`, or its near side. */
const edgeOf = (n: Node, axis: Axis, far: boolean): number => {
  const half = ((axis === 'x' ? n.width : n.height) ?? 0) / 2;
  return (n[axis] ?? 0) + (far ? half : -half);
};

/**
 * Lanes the author left empty get a band of their own, in source order between their
 * neighbours, as wide as their title needs: the phases give them no size (v12 collapses them).
 */
function placeEmptyLanes(data: LayoutData, laneOrder: readonly string[]): void {
  const byId = new Map(data.nodes.map((n) => [n.id, n]));
  const lanes = laneOrder.map((id) => byId.get(id)!);
  if (lanes.every(isPlaced)) return;
  const sideways = data.direction === 'LR' || data.direction === 'RL';
  const cross: Axis = sideways ? 'y' : 'x';
  const flow: Axis = sideways ? 'x' : 'y';
  const reference = lanes.find(isPlaced);
  const band = sideways ? leftTitleBandWidth(lanes) : 0;
  const flowSize = reference
    ? ((sideways ? reference.width : reference.height) ?? 0)
    : 2 * 36 + band;
  const flowCentre = reference ? (reference[flow] ?? 0) : flowSize / 2;
  let at = reference ? edgeOf(reference, cross, false) : 0;
  for (const lane of lanes) {
    if (isPlaced(lane)) {
      at = edgeOf(lane, cross, true);
      continue;
    }
    const pad = Math.max(lane.padding ?? 20, 20);
    const size = Math.max(2 * pad, (lane.titleSize?.width ?? 0) + 2 * pad);
    shiftBeyond(data, cross, at, size);
    lane[cross] = at + size / 2;
    lane[flow] = flowCentre;
    lane.width = sideways ? flowSize : size;
    lane.height = sideways ? size : flowSize;
    const left = lane.x! - lane.width / 2;
    const top = lane.y! - lane.height / 2;
    lane.groupTitleRect = sideways
      ? { left, right: left + band, top, bottom: top + lane.height }
      : { left, right: left + lane.width, top, bottom: top + topLaneTitleBandHeight(lane) };
    at += size;
  }
}

const boxOf = (n: Node): PlacedBox => ({
  x: n.x ?? 0,
  y: n.y ?? 0,
  width: n.width ?? 0,
  height: n.height ?? 0,
});

/** The side of `b` a route end `p` lies on. */
function sideOf(b: PlacedBox, p: Point): Side {
  const d: [Side, number][] = [
    ['top', Math.abs(p.y - (b.y - b.height / 2))],
    ['bottom', Math.abs(p.y - (b.y + b.height / 2))],
    ['left', Math.abs(p.x - (b.x - b.width / 2))],
    ['right', Math.abs(p.x - (b.x + b.width / 2))],
  ];
  return d.reduce((best, s) => (s[1] < best[1] ? s : best))[0];
}

/** The edges' routes: the router's points once it writes them (T0b), else placeholders. */
function routes(graph: LayoutGraph, data: LayoutData): Map<string, LayoutModelEdge> {
  const byId = new Map(data.nodes.map((n) => [n.id, n]));
  const edgeById = new Map(data.edges.map((e) => [e.id, e]));
  const flowVertical = data.direction === 'TB' || data.direction === 'BT';
  const out = new Map<string, LayoutModelEdge>();
  for (const e of graph.edges) {
    const s = boxOf(byId.get(e.source)!);
    const t = boxOf(byId.get(e.target)!);
    const own = edgeById.get(e.id);
    const routed = own?.points;
    let placed: LayoutModelEdge;
    if (routed && routed.length >= 2) {
      const points: RoutePoint[] = routed.map((p, i) => {
        const prev = routed[i - 1] ?? routed[i + 1]!;
        return { x: p.x, y: p.y, axis: Math.abs(prev.x - p.x) < 0.5 ? 'v' : 'h' };
      });
      placed = {
        points,
        ports: { source: sideOf(s, points[0]!), target: sideOf(t, points.at(-1)!) },
      };
    } else {
      placed = placeholderRoute(s, t, flowVertical, e.source === e.target);
    }
    const label = own?.labelNodeId ? byId.get(own.labelNodeId) : undefined;
    if (label) placed.label = { x: label.x ?? 0, y: label.y ?? 0 };
    out.set(e.id, placed);
  }
  return out;
}

/** The centre of a group's title band. */
function titleOf(g: Node, isLane: boolean): Point {
  const r = g.groupTitleRect;
  if (r) return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
  const top = (g.y ?? 0) - (g.height ?? 0) / 2;
  const band = isLane ? topLaneTitleBandHeight(g) : (g.paddingBox?.top ?? 0);
  return { x: g.x ?? 0, y: top + band / 2 };
}

/**
 * The `LayoutModel`: every graph node and group, plus the default lane when the engine made one
 * (`__swimlane_default__`), moved so the drawing starts at `diagramPadding`.
 */
export function toLayoutModel(
  graph: LayoutGraph,
  data: LayoutData,
  laneOrder: readonly string[]
): LayoutModel {
  placeEmptyLanes(data, laneOrder);
  const edges = routes(graph, data);
  const laneModel = buildLaneModel(data.nodes);
  const byId = new Map(data.nodes.map((n) => [n.id, n]));
  const nodes = graph.nodes.map((n) => byId.get(n.id)!);
  const groups = data.nodes.filter((n) => n.isGroup);

  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const take = (x: number, y: number, w = 0, h = 0): void => {
    x0 = Math.min(x0, x - w / 2);
    x1 = Math.max(x1, x + w / 2);
    y0 = Math.min(y0, y - h / 2);
    y1 = Math.max(y1, y + h / 2);
  };
  for (const n of [...nodes, ...groups]) take(n.x ?? 0, n.y ?? 0, n.width ?? 0, n.height ?? 0);
  for (const e of edges.values()) for (const p of e.points) take(p.x, p.y);
  for (const n of data.nodes)
    if (n.isEdgeLabel) take(n.x ?? 0, n.y ?? 0, n.width ?? 0, n.height ?? 0);
  if (x0 === Infinity) [x0, y0, x1, y1] = [0, 0, 0, 0];

  const pad = graph.diagramPadding ?? 0;
  const dx = pad - x0;
  const dy = pad - y0;
  const move = <P extends Point>(p: P): P => ({ ...p, x: p.x + dx, y: p.y + dy });
  const box = (n: Node): LayoutModelNode => ({
    x: (n.x ?? 0) + dx,
    y: (n.y ?? 0) + dy,
    width: n.width ?? 0,
    height: n.height ?? 0,
  });

  const modelGroups = new Map<string, LayoutModelGroup>();
  for (const g of groups) {
    modelGroups.set(g.id, { ...box(g), title: move(titleOf(g, laneModel.isLane(g.id))) });
  }
  for (const e of edges.values()) {
    e.points = e.points.map(move);
    if (e.label) e.label = move(e.label);
  }
  return {
    width: x1 - x0 + 2 * pad,
    height: y1 - y0 + 2 * pad,
    nodes: new Map(graph.nodes.map((n, i) => [n.id, box(nodes[i]!)])),
    edges,
    groups: modelGroups,
    direction: graph.direction,
  };
}

/**
 * The lanes in source order, as the phases place them: the default lane first (v12 adds it last
 * to a list it reads backwards), then the top-level groups as the graph lists them.
 */
export function laneOrderOf(data: LayoutData, graph: LayoutGraph): string[] {
  const order = graph.groups.filter((g) => g.parent === undefined).map((g) => g.id);
  if (!order.includes(DEFAULT_SWIMLANE_ID) && data.nodes.some((n) => n.id === DEFAULT_SWIMLANE_ID))
    order.unshift(DEFAULT_SWIMLANE_ID);
  return order;
}
