// `LayoutEdge.sides` as hints (D327, D503): once `layered` has placed everything, an edge that
// names a side is drawn again from its ends (D718). A named end goes to the middle of its side, or
// `anchorY` down a `left`/`right` side (architecture's icon line); an end with no side named stays
// where layered put it. The named ends on one side of a node are spread along it. A stub runs
// straight out, then right angles from stub to stub, round the nodes and off the runs of the
// routes drawn before it; the label moves onto the route, nearest where layered put it. Ranks,
// order and boxes stay; the drawing grows where a stub reaches past it. An edge between a node and
// its own group, and a self-loop on the sides layered's loop took, keep layered's route. Limits:
// #525 GAPS (T0b): from stub to stub a route has two corners, so it cannot always go round.
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

interface Size {
  width: number;
  height: number;
}
type Box = Point & Size;
// An end: where, on which side, of which box, and how much longer than `corner` its stub is.
type End = [Point, Side, Box, number?];
// A node, or the run of a route drawn before (`a`: which way it runs, as `RoutePoint.axis`), which
// blocks only a leg that runs the same way: a crossing is allowed, running along it is not.
type Wall = Rect & { a?: RoutePoint['axis'] };

const segment = (p: Point, q: Point): Rect => ({
  x0: Math.min(p.x, q.x),
  y0: Math.min(p.y, q.y),
  x1: Math.max(p.x, q.x),
  y1: Math.max(p.y, q.y),
});

// `r` grown by `d` all round.
const grown = (r: Rect, d: number): Rect => ({
  x0: r.x0 - d,
  y0: r.y0 - d,
  x1: r.x1 + d,
  y1: r.y1 + d,
});

// How bad a path is: a wall it runs through or a leg straight back over the one before costs 9,
// a turn 1, a leg within `pad` of a node a half (D718), and length a little.
function cost(path: readonly Point[], walls: readonly Wall[], pad: number): number {
  let n = 0;
  let d: number[] = [];
  for (let i = 1; i < path.length; i++) {
    const [p, q] = [path[i - 1]!, path[i]!];
    const e = [Math.sign(q.x - p.x), Math.sign(q.y - p.y)];
    if (!e[0] && !e[1]) continue;
    if (d.length) n += e[0] === -d[0]! && e[1] === -d[1]! ? 9 : +(e[0] !== d[0] || e[1] !== d[1]);
    d = e;
    n += Math.abs(q.x - p.x + q.y - p.y) * 1e-6;
    const a = e[0] ? 'h' : 'v';
    const r = segment(p, q);
    for (const w of walls)
      if ((w.a ?? a) === a && hits(r, w)) n += 9;
      else if (!w.a && hits(r, grown(w, pad))) n += 0.5;
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
  walls: readonly Wall[],
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
        const n = cost([...seq.slice(-2), ...c, to, ...after], walls, gap / 2);
        if (n < low) [low, best] = [n, c];
      }
    }
    const path = [a, ...best, to];
    lanes = walls.filter((w) => path.some((q, i) => i > 0 && hits(segment(path[i - 1]!, q), w)));
  }
  // A corner on `to` itself would hide the way the route reaches it from the next link.
  return best.filter((c) => c.x !== to.x || c.y !== to.y);
}

// Where an end of `e` goes, on which side of which box.
function place(e: LayoutEdge, which: 'source' | 'target', model: LayoutModel, anchor?: number) {
  const placed = model.edges.get(e.id)!;
  const r = which === 'source' ? placed.points[0]! : placed.points.at(-1)!;
  const named = e.sides?.[which];
  const side = named ?? placed.ports[which];
  const b = (model.nodes.get(e[which]) ?? model.groups.get(e[which]))!;
  const { axis, sign } = OUTWARD[side];
  const p = { x: r.x, y: r.y };
  if (named) {
    p.x = b.x;
    p.y = b.y;
    p[axis] += (sign * (axis === 'x' ? b.width : b.height)) / 2;
    if (axis === 'x' && anchor !== undefined) p.y = b.y - b.height / 2 + anchor;
  }
  return [p, side, b] as End;
}

// Where the label of size `size`, which layered put at `w`, goes beside the route `seq` (D718):
// the route no longer runs through `w`, which turned it back on itself. Against a leg between the
// stubs, `gap` off either side of it, at the leg's point nearest `w` or its middle: the place
// nearest `w` where the label covers no node and no route drawn before; else `w`.
function labelOn(
  seq: readonly Point[],
  w: Point,
  size: Size,
  walls: readonly Wall[],
  gap: number
): Point {
  let label = w;
  let near = Infinity;
  for (let i = 2; i < seq.length - 1; i++) {
    const [p, q] = [seq[i - 1]!, seq[i]!];
    const r = segment(p, q);
    const k = p.y === q.y ? 'y' : 'x';
    if (p.x === q.x && k === 'y') continue;
    for (const c of [
      { x: Math.min(Math.max(w.x, r.x0), r.x1), y: Math.min(Math.max(w.y, r.y0), r.y1) },
      { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 },
    ])
      for (const s of [-0.5, 0.5]) {
        const at = { ...c, [k]: c[k] + s * ((k === 'x' ? size.width : size.height) + 2 * gap) };
        const d = Math.hypot(at.x - w.x, at.y - w.y);
        if (d < near && !walls.some((n) => hits(rectOf(at, size), n))) [near, label] = [d, at];
      }
  }
  return label;
}

// `e` drawn again between its ends `s` and `t`, clear of the `nodes` and earlier runs; and the
// points it was drawn through, stubs and all.
function route(
  e: LayoutEdge,
  [[ps, sSide, sb, sx = 0], [pt, tSide, tb, tx = 0]]: [End, End],
  model: LayoutModel,
  nodes: readonly Wall[],
  M: LayoutMetrics,
  head: number
): [LayoutModelEdge, Point[]] {
  const stub = (p: Point, side: Side, length: number): Point => {
    const { axis, sign } = OUTWARD[side];
    return { ...p, [axis]: p[axis] + sign * (M.corner + length) };
  };
  const qs = stub(ps, sSide, sx + (e.startMarker?.length ?? 0));
  const qt = stub(pt, tSide, tx + head + (e.endMarker?.length ?? 0));
  const placed = model.edges.get(e.id)!;
  const seq: Point[] = [ps, qs];
  const ends = [rectOf(sb, sb), rectOf(tb, tb)];
  seq.push(...link(seq, qt, [pt], [...nodes, ...ends], ends, M.corner), qt, pt);
  // Repeats go, and so does a point the route runs straight on through.
  const points: RoutePoint[] = [];
  for (const p of seq) {
    const [q, r] = [points.at(-1), points.at(-2)];
    if (q?.x === p.x && q.y === p.y) continue;
    if (r && q && ((r.x === q.x && q.x === p.x) || (r.y === q.y && q.y === p.y))) points.pop();
    const flat = points.length ? points.at(-1)!.y === p.y : OUTWARD[sSide].axis === 'x';
    points.push({ x: p.x, y: p.y, axis: flat ? 'h' : 'v' });
  }
  return [{ ...placed, points, ports: { source: sSide, target: tSide } }, seq];
}

// Spreads the named ends on one side of a node along it (D718), as layered spreads its own:
// `portPitch` apart, less on a short side, `corner` clear of each end of it, round where one
// alone would go, ordered by the way each edge's far end lies so that they do not cross. Of two
// that turn the same way, the one further from where they turn gets the longer stub, so that
// their runs out are a pitch apart.
function spread(sides: Map<string, [End, End][]>, M: LayoutMetrics): void {
  for (const list of sides.values()) {
    const [[[p, side, b]]] = list as [[End, End]];
    const { axis, sign } = OUTWARD[side];
    const k = axis === 'x' ? 'y' : 'x';
    const n = list.length - 1;
    if (!n) continue;
    const room = Math.max(0, (k === 'x' ? b.width : b.height) - 2 * M.corner);
    const pitch = Math.min(M.portPitch, room / n);
    const lo = b[k] - room / 2 + (n * pitch) / 2;
    const mid = Math.min(Math.max(p[k], lo), lo + room - n * pitch);
    const way = ([, [o]]: [End, End]) => Math.atan2(o[k] - b[k], sign * (o[axis] - b[axis]));
    list.sort((u, v) => way(u) - way(v));
    list.forEach((u, i) => {
      u[0][0][k] = mid + (i - n / 2) * pitch;
      u[0][3] = pitch * (way(u) > 0 ? n - i : i);
    });
  }
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
 * Draws the edges of `model` that name a side (D503, D718) again, in place: a stub out of each
 * side (`corner`, plus the start marker at the source and the arrowhead's room and end marker at
 * the target), then right angles from stub to stub, each route a wall to the ones after it. Grows
 * the drawing where they reach into its margin. `index` maps ids to node and group indices.
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
  const todo: [LayoutEdge, End, End][] = [];
  const sides = new Map<string, [End, End][]>();
  const add = (id: string, end: End, far: End) =>
    sides.set(id + end[1], [...(sides.get(id + end[1]) ?? []), [end, far]]);
  for (const e of graph.edges) {
    const named = e.sides ?? {};
    if (!(named.source ?? named.target) || within(e.source, e.target) || within(e.target, e.source))
      continue;
    const s = place(e, 'source', model, graph.nodes[at(e.source)]?.anchorY);
    const t = place(e, 'target', model, graph.nodes[at(e.target)]?.anchorY);
    const { ports } = model.edges.get(e.id)!;
    // A loop with both ends on one side, or on the sides layered's loop took, keeps that loop.
    if (
      e.source === e.target &&
      (s[1] === t[1] || (s[1] === ports.source && t[1] === ports.target))
    )
      continue;
    todo.push([e, s, t]);
    if (named.source) add(e.source, s, t);
    if (named.target) add(e.target, t, s);
  }
  if (!todo.length) return model;
  spread(sides, M);
  // Every node is a wall to a route, and so is every route drawn before it (D718).
  const walls: Wall[] = Array.from(model.nodes.values(), (b) => rectOf(b, b));
  const drawn: Point[] = [];
  const labels: [Size, LayoutModelEdge, Point[]][] = [];
  for (const [e, s, t] of todo) {
    const [redrawn, seq] = route(e, [s, t], model, walls, M, graph.headRoom ?? 0);
    model.edges.set(e.id, redrawn);
    const pts = redrawn.points;
    drawn.push(...pts);
    if (e.label) labels.push([e.label, redrawn, seq]);
    // Each run, half a pitch wider all round, is a wall to the runs alongside it.
    for (let i = 1; i < pts.length; i++) {
      walls.push({ ...grown(segment(pts[i - 1]!, pts[i]!), M.portPitch / 2), a: pts[i]!.axis });
    }
  }
  // Then the labels, half a pitch off their routes, clear of every route and label before them;
  // the drawing grows to hold them too.
  for (const [size, r, seq] of labels) {
    if (!r.label) continue;
    const b = rectOf((r.label = labelOn(seq, r.label, size, walls, M.portPitch / 2)), size);
    walls.push(b);
    drawn.push({ x: b.x0, y: b.y0 }, { x: b.x1, y: b.y1 });
  }
  return grow(model, drawn, margin);
}
