// `LayoutEdge.sides` as hints (D327, D503): once `layered` has placed everything, an edge that
// names a side is drawn again from its ends (D718). A named end goes to the middle of its side, or
// `anchorY` down a `left`/`right` side (architecture's icon line); an end with no side named stays
// where layered put it. The named ends on one side of a node are spread along it. A stub runs
// straight out, then right angles from stub to stub, round the nodes and off the runs of the
// routes drawn before it; the label moves beside the route, nearest where layered put it. Ranks,
// order and boxes stay; the drawing grows where a stub reaches past it. An edge between a node and
// its own group, and a self-loop on the sides layered's loop took, keep layered's route. Limits:
// #525 GAPS (T0b): from stub to stub a route has two corners, so it cannot always go round.
// `@mermaid-js/core/layout/sides`, a subpath core's index does not re-export (D557, D718): layered
// reads no side; a diagram whose edges name sides passes layered's model through `honourSides`,
// so flowchart's closure (R-PERF-1) does not carry it, and the graph stays plain data (§6.1).
import type {
  LayoutEdge,
  LayoutGraph,
  LayoutModel,
  LayoutModelEdge,
  Point,
  RoutePoint,
  Side,
} from '../types.ts';
import { pxProfile, type LayoutMetrics } from '../units.ts';
import { hits, OUTWARD, rectOf, type Rect } from './end-markers.ts';
import { endLabels } from './index.ts';

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
  const ends = [...seq.slice(-2), to, ...after];
  for (let pass = 0; pass < 2 && low >= 9; pass++) {
    // Every path tried lies within `gap` of the box round the ends and lanes, so only the walls
    // that reach near that box can cost it anything: the rest are not looked at again.
    const fence = grown(
      [...ends.map((p) => segment(p, p)), ...lanes].reduce((u, r) => ({
        x0: Math.min(u.x0, r.x0),
        y0: Math.min(u.y0, r.y0),
        x1: Math.max(u.x1, r.x1),
        y1: Math.max(u.y1, r.y1),
      })),
      2 * gap
    );
    const near = walls.filter((w) => hits(fence, w));
    for (const k of ['x', 'y'] as const) {
      const lines = [to[k], a[k], (a[k] + to[k]) / 2];
      for (const b of lanes) lines.push(b[`${k}0`] - gap, b[`${k}1`] + gap);
      for (const v of lines) {
        const c = [
          { ...a, [k]: v },
          { ...to, [k]: v },
        ];
        const n = cost([...seq.slice(-2), ...c, to, ...after], near, gap / 2);
        if (n < low) [low, best] = [n, c];
      }
    }
    const path = [a, ...best, to];
    lanes = near.filter((w) => path.some((q, i) => i > 0 && hits(segment(path[i - 1]!, q), w)));
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
// nearest `w` where the label covers the fewest walls (nodes, groups' titles, routes and labels
// placed before), so where none is clear it still sits by its route.
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
        const d =
          Math.hypot(at.x - w.x, at.y - w.y) +
          1e6 * walls.filter((n) => hits(rectOf(at, size), n)).length;
        if (d < near) [near, label] = [d, at];
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
// their runs out are a pitch apart. The ways are read before any side is spread, so that the
// order of the sides does not matter.
function spread(sides: Map<string, [End, End][]>, M: LayoutMetrics): void {
  const way = new Map<[End, End], number>();
  for (const list of sides.values())
    for (const u of list) {
      const [[, side, b], [o]] = u;
      const { axis, sign } = OUTWARD[side];
      const k = axis === 'x' ? 'y' : 'x';
      way.set(u, Math.atan2(o[k] - b[k], sign * (o[axis] - b[axis])));
    }
  for (const list of sides.values()) {
    const [[[p, side, b]]] = list as [[End, End]];
    const k = OUTWARD[side].axis === 'x' ? 'y' : 'x';
    const n = list.length - 1;
    if (!n) continue;
    // On a side too short for its corners, the ends move into their room, evenly spaced along
    // it: as far from each other as from either end of the side.
    const len = k === 'x' ? b.width : b.height;
    const room = Math.max(len - 2 * M.corner, (len * n) / (n + 2));
    const pitch = Math.min(M.portPitch, room / n);
    const lo = b[k] - room / 2 + (n * pitch) / 2;
    const mid = Math.min(Math.max(p[k], lo), lo + room - n * pitch);
    list.sort((u, v) => way.get(u)! - way.get(v)!);
    list.forEach((u, i) => {
      u[0][0][k] = mid + (i - n / 2) * pitch;
      u[0][3] = pitch * (way.get(u)! > 0 ? n - i : i);
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
// The edges of `graph` to draw again, with their ends, and the named ends on each side of a node.
function toDraw(
  graph: LayoutGraph,
  model: LayoutModel
): [[LayoutEdge, End, End][], Map<string, [End, End][]>] {
  // Ids to node indices, then group indices after them, as layered numbers them.
  const index = new Map([...graph.nodes, ...graph.groups].map((n, i) => [n.id, i]));
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
  return [todo, sides];
}

// Whether the route `pts` runs through the box `n`.
const through = (pts: readonly Point[], n: Rect): boolean =>
  pts.some((q, i) => i && hits(segment(pts[i - 1]!, q), n));

// The groups' titles and borders, as walls to the labels: one may cover neither.
function groupWalls(graph: LayoutGraph, model: LayoutModel): Wall[] {
  return graph.groups.flatMap((g) => {
    const b = model.groups.get(g.id)!;
    const { x0, y0, x1, y1 } = rectOf(b, b);
    const sides = [
      { x0, y0, x1, y1: y0 },
      { x0, y0: y1, x1, y1 },
      { x0, y0, x1: x0, y1 },
      { x0: x1, y0, x1, y1 },
    ];
    return g.title ? [rectOf(b.title, g.title), ...sides] : sides;
  });
}

/**
 * Draws the edges of `model`, `layered`'s layout of `graph`, that name a side (D503, D718) again,
 * in place, and returns it: a stub out of each side (`corner`, plus the start marker at the source
 * and the arrowhead's room and end marker at the target), then right angles from stub to stub,
 * each route a wall to the ones after it. Grows the drawing where they reach into its margin
 * (`diagramPadding`). On the grid (D140) it changes nothing.
 */
export function honourSides(graph: LayoutGraph, model: LayoutModel): LayoutModel {
  const M = graph.metrics ?? pxProfile.engine;
  const [todo, sides] = toDraw(graph, model);
  if (graph.grid || !todo.length) return model;
  spread(sides, M);
  // Every node is a wall to a route, and so is every route drawn before it (D718).
  const nodes = Array.from(model.nodes.values(), (b) => rectOf(b, b));
  const walls: Wall[] = [...nodes];
  const drawn: Point[] = [];
  const labels: [Size, LayoutModelEdge, Point[]?][] = [];
  for (const [e, s, t] of todo) {
    const was = model.edges.get(e.id)!;
    const redrawn = route(e, [s, t], model, walls, M, graph.headRoom ?? 0);
    // Where the sides are the ones layered took, and its route went round a node that this one,
    // with two corners at most (#525 GAPS), would run through, layered's route stays, label and all.
    const kept =
      s[1] === was.ports.source &&
      t[1] === was.ports.target &&
      nodes.some((n) => through(redrawn[0].points, n) && !through(was.points, n));
    const [placed, seq] = kept ? [was] : redrawn;
    model.edges.set(e.id, placed);
    const pts = placed.points;
    drawn.push(...pts);
    if (e.label) labels.push([e.label, placed, seq]);
    // Each run, half a pitch wider all round, is a wall to the runs alongside it.
    for (let i = 1; i < pts.length; i++) {
      walls.push({ ...grown(segment(pts[i - 1]!, pts[i]!), M.portPitch / 2), a: pts[i]!.axis });
    }
  }
  // Then the labels, half a pitch off their routes, clear of every route and label before them,
  // of the groups' titles and across none of their borders; the drawing grows to hold them too.
  walls.push(...groupWalls(graph, model));
  for (const [size, r, seq] of labels) {
    if (!r.label) continue;
    if (seq) r.label = labelOn(seq, r.label, size, walls, M.portPitch / 2);
    const b = rectOf(r.label, size);
    walls.push(b);
    drawn.push({ x: b.x0, y: b.y0 }, { x: b.x1, y: b.y1 });
  }
  // The end labels go again beside the routes as drawn (D102).
  return endLabels(graph, grow(model, drawn, graph.diagramPadding ?? 0), 0);
}
