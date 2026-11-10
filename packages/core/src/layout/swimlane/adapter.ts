// The engine's edges (D532): `toLayoutData` builds the internal, mutable `LayoutData` from a
// `LayoutGraph` (groups listed last first, as v12's flowDb emits them, so the ported phases read
// lanes in source order), and `toLayoutModel` writes a `LayoutModel` back from it once the
// phases have run. Nothing else in the engine knows `LayoutGraph` or `LayoutModel`.
import type {
  LayoutGraph,
  LayoutModel,
  LayoutModelEdge,
  Point,
  RoutePoint,
  Side,
} from '../types.ts';
import { topLaneHorizontalPadding, topLaneTitleBandHeight } from './helpers.ts';
import { isPlaced, shiftBeyond } from './laneFit.ts';
import type { LayoutData, Node, SwimlaneTuning } from './layoutData.ts';
import { buildLaneModel } from './lanes.ts';
import { leftTitleBandWidth } from './direction/lrTransform.ts';
import { placeEndLabels } from './endLabels.ts';
import { type PlacedBox, placeholderRoute } from './placeholderRoutes.ts';

function finite(v: number, what: string): void {
  if (!Number.isFinite(v) || v < 0)
    throw new RangeError(`layout: ${what} must be a finite number >= 0, got ${v}`);
}

/**
 * Rejects what `tree` and `layered` reject, with their messages: duplicate ids, unknown ends,
 * sizes and spacing that are not finite numbers of at least 0. `grid` is a RangeError: text output lays
 * out with `layered` (D179), so no caller hands this engine character cells.
 */
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
    for (const s of [e.label, e.startLabel, e.endLabel]) {
      if (!s) continue;
      finite(s.width, `label width of edge '${e.id}'`);
      finite(s.height, `label height of edge '${e.id}'`);
    }
  }
  finite(graph.spacing.node, 'spacing.node');
  finite(graph.spacing.rank, 'spacing.rank');
  finite(graph.diagramPadding ?? 0, 'diagramPadding');
  if (graph.grid !== undefined)
    throw new RangeError(`layout: grid is not supported by swimlane, got ${graph.grid}`);
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
    ...(n.shape === undefined ? {} : { shape: n.shape }),
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

type Axis = 'x' | 'y';

/** The far side of a placed box along `axis`, or its near side. */
const edgeOf = (n: Node, axis: Axis, far: boolean): number => {
  const half = ((axis === 'x' ? n.width : n.height) ?? 0) / 2;
  return (n[axis] ?? 0) + (far ? half : -half);
};

/**
 * Lanes the author left empty get a band of their own, between their neighbours in the order
 * the phases placed the lanes (`laneOrder`: source order, or the automatic order), as wide as their title needs: the phases give them no size (v12 collapses them).
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
    const pad = topLaneHorizontalPadding(lane);
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

/** Whether group `group` holds `id`, however deep. */
function holds(byId: ReadonlyMap<string, Node>, group: string, id: string): boolean {
  const seen = new Set<string>();
  for (let p = byId.get(id)?.parentId; p !== undefined && !seen.has(p); p = byId.get(p)?.parentId) {
    if (p === group) return true;
    seen.add(p);
  }
  return false;
}

/**
 * The edges' routes, from the router's points (self-loops from `routeSelfLoops`). Each point's
 * axis is the way the route runs into it; the first takes its next segment's. Post-processing
 * repeats a route's end points for v12's renderer, so repeats are dropped. An edge between a
 * node and a group around it (which v12's router doubles back through), or one the router left
 * without two distinct points, takes T0a's right-angled placeholder instead: one edge never
 * fails the render.
 */
function routes(graph: LayoutGraph, data: LayoutData): Map<string, LayoutModelEdge> {
  const byId = new Map(data.nodes.map((n) => [n.id, n]));
  const flowVertical = data.direction === 'TB' || data.direction === 'BT';
  const edgeById = new Map(data.edges.map((e) => [e.id, e]));
  const out = new Map<string, LayoutModelEdge>();
  for (const e of graph.edges) {
    const s = boxOf(byId.get(e.source)!);
    const t = boxOf(byId.get(e.target)!);
    const own = edgeById.get(e.id);
    const routed = (own?.points ?? []).filter(
      (p, i, all) => i === 0 || Math.abs(p.x - all[i - 1]!.x) + Math.abs(p.y - all[i - 1]!.y) > 1e-6
    );
    const nested = holds(byId, e.source, e.target) || holds(byId, e.target, e.source);
    let placed: LayoutModelEdge;
    if (routed.length < 2 || nested) {
      placed = placeholderRoute(s, t, flowVertical, e.source === e.target);
    } else {
      const points: RoutePoint[] = routed.map((p, i) => {
        const prev = routed[i - 1] ?? routed[i + 1]!;
        return { x: p.x, y: p.y, axis: Math.abs(prev.x - p.x) < 0.5 ? 'v' : 'h' };
      });
      placed = {
        points,
        ports: { source: sideOf(s, points[0]!), target: sideOf(t, points.at(-1)!) },
      };
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

/** Moves the whole model by `dx`, `dy`. */
function translate(model: LayoutModel, dx: number, dy: number): void {
  const move = <P extends Point>(p: P): P => ({ ...p, x: p.x + dx, y: p.y + dy });
  for (const b of [...model.nodes.values(), ...model.groups.values()]) {
    b.x += dx;
    b.y += dy;
  }
  for (const g of model.groups.values()) g.title = move(g.title);
  for (const e of model.edges.values()) {
    e.points = e.points.map(move);
    if (e.label) e.label = move(e.label);
    if (e.startLabel) e.startLabel = move(e.startLabel);
    if (e.endLabel) e.endLabel = move(e.endLabel);
  }
}

/** The extent of everything drawn: boxes, routes and labels. */
function extent(graph: LayoutGraph, model: LayoutModel): [number, number, number, number] {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  const take = (p: Point, s?: { width: number; height: number }): void => {
    const [w, h] = [s?.width ?? 0, s?.height ?? 0];
    x0 = Math.min(x0, p.x - w / 2);
    x1 = Math.max(x1, p.x + w / 2);
    y0 = Math.min(y0, p.y - h / 2);
    y1 = Math.max(y1, p.y + h / 2);
  };
  for (const b of [...model.nodes.values(), ...model.groups.values()]) take(b, b);
  for (const e of graph.edges) {
    const placed = model.edges.get(e.id);
    if (!placed) continue;
    for (const p of placed.points) take(p);
    if (placed.label) take(placed.label, e.label);
    if (placed.startLabel) take(placed.startLabel, e.startLabel);
    if (placed.endLabel) take(placed.endLabel, e.endLabel);
  }
  return x0 === Infinity ? [0, 0, 0, 0] : [x0, y0, x1, y1];
}

/** The lanes across the flow: the phases' `laneOrder`, then any lane it left out. */
function laneIds(data: LayoutData, isLane: (id: string) => boolean): string[] {
  const all = data.nodes.filter((n) => n.isGroup && isLane(n.id)).map((n) => n.id);
  const known = new Set(all);
  const ordered = (data.laneOrder ?? []).filter((id) => known.has(id));
  const seen = new Set(ordered);
  return [...ordered, ...all.filter((id) => !seen.has(id))];
}

/**
 * The `LayoutModel`: every graph node and group, plus the default lane when the engine made one
 * (`__swimlane_default__`), with end labels placed, moved so the drawing starts at
 * `diagramPadding`.
 */
export function toLayoutModel(graph: LayoutGraph, data: LayoutData): LayoutModel {
  placeEmptyLanes(data, data.laneOrder ?? []);
  const laneModel = buildLaneModel(data.nodes);
  const byId = new Map(data.nodes.map((n) => [n.id, n]));
  const model: LayoutModel = {
    width: 0,
    height: 0,
    nodes: new Map(graph.nodes.map((n) => [n.id, boxOf(byId.get(n.id)!)])),
    edges: routes(graph, data),
    groups: new Map(
      data.nodes
        .filter((n) => n.isGroup)
        .map((g) => [g.id, { ...boxOf(g), title: titleOf(g, laneModel.isLane(g.id)) }])
    ),
    direction: graph.direction,
    lanes: laneIds(data, laneModel.isLane),
  };
  placeEndLabels(graph, model);
  const [x0, y0, x1, y1] = extent(graph, model);
  const pad = graph.diagramPadding ?? 0;
  translate(model, pad - x0, pad - y0);
  model.width = x1 - x0 + 2 * pad;
  model.height = y1 - y0 + 2 * pad;
  return model;
}
