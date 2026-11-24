// `LayoutEdge.sides` as hints (D327, D503): once `layered` has placed everything, an edge with an
// end its named side moves is drawn again from its ends. Each end goes onto its side: the middle
// where layered took another side, `anchorY` down any named `left`/`right` side (architecture's
// icon line, so those edges are always drawn again), else where layered put it. A stub runs
// straight out, then right angles from stub to stub through the label, round the nodes. Ranks,
// order, boxes and labels stay; the drawing grows where a stub reaches past it. An edge between a
// node and its own group keeps layered's route. Limits: #525 GAPS (T0b).
import type {
  LayoutEdge,
  LayoutGraph,
  LayoutModel,
  LayoutModelEdge,
  Point,
  RoutePoint,
  Side,
} from '../types.ts';
import type { LayoutMetrics } from '../units.ts';
import { hits, rectOf, type Rect } from './end-markers.ts';

/** The axis a side faces along, and which way is out of the box. */
export const OUTWARD: Readonly<Record<Side, { axis: 'x' | 'y'; sign: 1 | -1 }>> = {
  top: { axis: 'y', sign: -1 },
  bottom: { axis: 'y', sign: 1 },
  left: { axis: 'x', sign: -1 },
  right: { axis: 'x', sign: 1 },
};

type Box = Point & { width: number; height: number };
type End = [Point, Side, Box];

const segment = (p: Point, q: Point): Rect => ({
  x0: Math.min(p.x, q.x),
  y0: Math.min(p.y, q.y),
  x1: Math.max(p.x, q.x),
  y1: Math.max(p.y, q.y),
});

// How bad a path is: a node it runs through or a leg straight back over the one before costs 9,
// a turn 1, and length a little.
function cost(path: readonly Point[], walls: readonly Rect[]): number {
  let n = 0;
  let d: number[] = [];
  for (let i = 1; i < path.length; i++) {
    const [p, q] = [path[i - 1]!, path[i]!];
    const e = [Math.sign(q.x - p.x), Math.sign(q.y - p.y)];
    if (!e[0] && !e[1]) continue;
    if (d.length) n += e[0] === -d[0]! && e[1] === -d[1]! ? 9 : +(e[0] !== d[0] || e[1] !== d[1]);
    d = e;
    n += Math.abs(q.x - p.x + q.y - p.y) * 1e-6;
    for (const w of walls) if (hits(segment(p, q), w)) n += 9;
  }
  return n;
}

// The corners from the last point of `seq` to `to` (then on to `after`): two, on a line through
// either point, midway, or `gap` past a box, whichever path `cost`s least. The boxes are the
// ends', then, if the best path still runs through a wall, those walls' too.
function link(
  seq: readonly Point[],
  to: Point,
  after: Point[],
  walls: readonly Rect[],
  boxes: readonly Rect[],
  gap: number
): Point[] {
  const a = seq.at(-1)!;
  let best: Point[] = [];
  let low = Infinity;
  let lanes = boxes;
  for (let pass = 0; pass < 2 && low >= 9; pass++) {
    for (const k of ['x', 'y'] as const) {
      const lines = [to[k], a[k], (a[k] + to[k]) / 2];
      for (const b of lanes) lines.push(b[`${k}0`] - gap, b[`${k}1`] + gap);
      for (const v of lines) {
        const c = [
          { ...a, [k]: v },
          { ...to, [k]: v },
        ];
        const n = cost([...seq.slice(-2), ...c, to, ...after], walls);
        if (n < low) [low, best] = [n, c];
      }
    }
    const path = [a, ...best, to];
    lanes = walls.filter((w) => path.some((q, i) => i > 0 && hits(segment(path[i - 1]!, q), w)));
  }
  // A corner on `to` itself would hide the way the route reaches it from the next link.
  return best.filter((c) => c.x !== to.x || c.y !== to.y);
}

// Where an end of `e` goes, and whether that moves it.
function place(e: LayoutEdge, which: 'source' | 'target', model: LayoutModel, anchor?: number) {
  const placed = model.edges.get(e.id)!;
  const r = which === 'source' ? placed.points[0]! : placed.points.at(-1)!;
  const named = e.sides?.[which];
  const side = named ?? placed.ports[which];
  const b = (model.nodes.get(e[which]) ?? model.groups.get(e[which]))!;
  const { axis, sign } = OUTWARD[side];
  const p = { x: r.x, y: r.y };
  if (side !== placed.ports[which]) {
    p.x = b.x;
    p.y = b.y;
    p[axis] += (sign * (axis === 'x' ? b.width : b.height)) / 2;
  }
  if (named && axis === 'x' && anchor !== undefined) p.y = b.y - b.height / 2 + anchor;
  return [[p, side, b] as End, p.x !== r.x || p.y !== r.y] as const;
}

// `e` drawn again between its ends `s` and `t`, clear of the `nodes`.
function route(
  e: LayoutEdge,
  [[ps, sSide, sb], [pt, tSide, tb]]: [End, End],
  model: LayoutModel,
  nodes: readonly Rect[],
  M: LayoutMetrics,
  head: number
): LayoutModelEdge {
  const stub = (p: Point, side: Side, length: number): Point => {
    const { axis, sign } = OUTWARD[side];
    return { ...p, [axis]: p[axis] + sign * (M.corner + length) };
  };
  const qs = stub(ps, sSide, e.startMarker?.length ?? 0);
  const qt = stub(pt, tSide, head + (e.endMarker?.length ?? 0));
  const placed = model.edges.get(e.id)!;
  const seq: Point[] = [ps, qs];
  const label = placed.label;
  const ends = [rectOf(sb, sb), rectOf(tb, tb)];
  const walls = [...nodes, ...ends];
  const go = (to: Point, after: Point[]) => link(seq, to, after, walls, ends, M.corner);
  if (label) seq.push(...go(label, []), label);
  seq.push(...go(qt, [pt]), qt, pt);
  // Repeats go, and so does a point the route runs straight on through.
  const points: RoutePoint[] = [];
  for (const p of seq) {
    const [q, r] = [points.at(-1), points.at(-2)];
    if (q?.x === p.x && q.y === p.y) continue;
    if (r && q && ((r.x === q.x && q.x === p.x) || (r.y === q.y && q.y === p.y))) points.pop();
    const flat = points.length ? points.at(-1)!.y === p.y : OUTWARD[sSide].axis === 'x';
    points.push({ x: p.x, y: p.y, axis: flat ? 'h' : 'v' });
  }
  return { ...placed, points, ports: { source: sSide, target: tSide } };
}

// Grows the drawing where the `drawn` points reach into its `margin`, moving everything over.
function grow(model: LayoutModel, drawn: readonly Point[], margin: number): LayoutModel {
  const [dx, dy] = (['x', 'y'] as const).map((k) =>
    Math.max(0, margin - Math.min(...drawn.map((p) => p[k])))
  ) as [number, number];
  model.width = Math.max(model.width, Math.max(...drawn.map((p) => p.x)) + margin) + dx;
  model.height = Math.max(model.height, Math.max(...drawn.map((p) => p.y)) + margin) + dy;
  if (!dx && !dy) return model;
  const mv = (p: Point): void => {
    p.x += dx;
    p.y += dy;
  };
  for (const n of model.nodes.values()) mv(n);
  for (const g of model.groups.values()) [g, g.title].forEach(mv);
  for (const p of model.edges.values()) [...p.points, ...(p.label ? [p.label] : [])].forEach(mv);
  return model;
}

/**
 * Draws the edges of `model` whose named sides (D503) move an end again, in place: a stub out
 * of each side (`corner`, plus the start marker at the source and the arrowhead's room and end
 * marker at the target), then right angles from stub to stub through the label. Grows the drawing
 * where they reach into its margin. `index` maps ids to node and group indices.
 */
export function honourSides(
  graph: LayoutGraph,
  model: LayoutModel,
  M: LayoutMetrics,
  index: ReadonlyMap<string, number>,
  margin: number
): LayoutModel {
  const at = (id: string) => index.get(id)!;
  const parent = (id: string) =>
    (graph.nodes[at(id)] ?? graph.groups[at(id) - graph.nodes.length])?.parent;
  const within = (inner: string, outer: string): boolean => {
    let p = parent(inner);
    for (let n = 0; p !== undefined && p !== outer && n < graph.groups.length; n++) p = parent(p);
    return p === outer;
  };
  // Every node is an obstacle to a route, made at the first route.
  let nodes: Rect[] | undefined;
  const drawn: Point[] = [];
  for (const e of graph.edges) {
    if (!e.sides || within(e.source, e.target) || within(e.target, e.source)) continue;
    const [s, sMoved] = place(e, 'source', model, graph.nodes[at(e.source)]?.anchorY);
    const [t, tMoved] = place(e, 'target', model, graph.nodes[at(e.target)]?.anchorY);
    // A loop with both ends on one side keeps layered's loop.
    if ((!sMoved && !tMoved) || (e.source === e.target && s[1] === t[1])) continue;
    nodes ??= Array.from(model.nodes.values(), (b) => rectOf(b, b));
    const redrawn = route(e, [s, t], model, nodes, M, graph.headRoom ?? 0);
    model.edges.set(e.id, redrawn);
    drawn.push(...redrawn.points);
  }
  return drawn.length ? grow(model, drawn, margin) : model;
}
