// `LayoutEdge.sides` as hints (D327, D503): once `layered` has placed every node and routed every
// edge, an end with a named side that the route does not already use is moved onto that side.
// Ranks, node order and every box stay where they are; only the end's last stretch of route is
// redrawn: a stub straight out of the named side, then right angles to the first point of the
// route's middle (or to the other end), round the node rather than through it. The ends on a side
// that gains one are spread along it again, all of them, so none lands on another. A graph whose
// edges name no side is never touched. Not on the grid (D140's cells): there sides are ignored.
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

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

type Which = 'source' | 'target';

interface End {
  k: number;
  which: Which;
  id: string;
  side: Side;
  /** Where along the side the route heads off to, for ordering the ends on one side. */
  aim: number;
  at?: Point;
}

const NORMAL: Readonly<Record<Side, Point>> = {
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const across = (side: Side): boolean => side === 'top' || side === 'bottom';

// An unknown side is refused, as `compass` refuses it.
function checkSides(graph: LayoutGraph): void {
  for (const e of graph.edges) {
    for (const side of [e.sides?.source, e.sides?.target]) {
      if (side !== undefined && !Object.hasOwn(NORMAL, side))
        throw new RangeError(`layout: edge '${e.id}' has an unknown side '${String(side)}'`);
    }
  }
}

/**
 * Moves the ends of `model`'s routes onto the sides `graph`'s edges name (D503), in place, and
 * grows the drawing where a moved end reaches past it. `margin` is the drawing's padding. Returns
 * `model`, untouched where no edge names a side `layered` did not already take.
 */
export function honourSides(
  graph: LayoutGraph,
  model: LayoutModel,
  M: LayoutMetrics,
  margin: number
): LayoutModel {
  if (!graph.edges.some((e) => e.sides?.source ?? e.sides?.target)) return model;
  checkSides(graph);
  const boxOf = (id: string): Box | undefined => model.nodes.get(id) ?? model.groups.get(id);
  const parent = new Map<string, string | undefined>();
  for (const n of graph.nodes) parent.set(n.id, n.parent);
  for (const g of graph.groups) parent.set(g.id, g.parent);
  const within = (inner: string, outer: string): boolean => {
    const seen = new Set<string>();
    for (let p = parent.get(inner); p !== undefined && !seen.has(p); p = parent.get(p)) {
      if (p === outer) return true;
      seen.add(p);
    }
    return false;
  };
  const anchorY = new Map<string, number>();
  for (const n of graph.nodes) if (n.anchorY !== undefined) anchorY.set(n.id, n.anchorY);

  // Edges whose ends may move: not one between a group and its own member, whose route runs
  // inside the group's box.
  const movable = (e: LayoutEdge): boolean =>
    e.source === e.target || !(within(e.source, e.target) || within(e.target, e.source));

  const ends: End[] = [];
  const dirty = new Set<string>();
  const key = (id: string, side: Side): string => `${id}\u0000${side}`;
  graph.edges.forEach((e, k) => {
    const placed = model.edges.get(e.id);
    if (!placed || placed.points.length < 2 || !movable(e)) return;
    const pts = placed.points;
    for (const which of ['source', 'target'] as const) {
      const id = e[which];
      const wanted = e.sides?.[which];
      const side = wanted ?? placed.ports[which];
      // The point the route heads for after this end, before any move.
      const next = which === 'source' ? pts[1]! : pts[pts.length - 2]!;
      ends.push({ k, which, id, side, aim: across(side) ? next.x : next.y });
      if (wanted !== undefined && wanted !== placed.ports[which]) dirty.add(key(id, side));
    }
  });
  if (dirty.size === 0) return model;

  // Every end on a side that gains one is spread along it again.
  const bySide = new Map<string, End[]>();
  for (const end of ends) {
    const at = key(end.id, end.side);
    if (!dirty.has(at)) continue;
    let list = bySide.get(at);
    if (!list) bySide.set(at, (list = []));
    list.push(end);
  }
  for (const list of bySide.values()) spreadAlong(list, boxOf(list[0]!.id)!, M, anchorY);

  const moved = new Map<number, Partial<Record<Which, End>>>();
  for (const list of bySide.values()) {
    for (const end of list) {
      const m = moved.get(end.k) ?? {};
      m[end.which] = end;
      moved.set(end.k, m);
    }
  }
  const headRoom = graph.headRoom ?? 0;
  const lo = { x: Infinity, y: Infinity };
  const hi = { x: -Infinity, y: -Infinity };
  const reach = (p: Point, half?: { width: number; height: number }): void => {
    const w = half ? half.width / 2 : 0;
    const h = half ? half.height / 2 : 0;
    lo.x = Math.min(lo.x, p.x - w);
    lo.y = Math.min(lo.y, p.y - h);
    hi.x = Math.max(hi.x, p.x + w);
    hi.y = Math.max(hi.y, p.y + h);
  };
  for (const [k, m] of moved) {
    const e = graph.edges[k]!;
    const placed = model.edges.get(e.id)!;
    const stub = (which: Which): number => {
      const marker = which === 'source' ? e.startMarker : e.endMarker;
      return Math.max(M.portSep, Math.max(headRoom, marker?.length ?? 0) + M.corner);
    };
    const redrawn =
      e.source === e.target
        ? loop(placed, m, boxOf(e.source)!, stub, e.label, M)
        : reroute(placed, m, { source: boxOf(e.source)!, target: boxOf(e.target)! }, stub, e.label);
    model.edges.set(e.id, redrawn);
    for (const p of redrawn.points) reach(p);
    if (redrawn.label && e.label) reach(redrawn.label, e.label);
  }
  fit(model, lo, hi, margin);
  return model;
}

// Spreads the ends on one side of `box`, in the order they head off in, `portPitch` apart (closer
// where the side is short), round the side's middle, or round `anchorY` on a left or right side.
function spreadAlong(
  list: End[],
  box: Box,
  M: LayoutMetrics,
  anchorY: ReadonlyMap<string, number>
): void {
  list.sort((a, b) => a.aim - b.aim || a.k - b.k || (a.which === 'source' ? -1 : 1));
  const side = list[0]!.side;
  const wide = across(side);
  const length = wide ? box.width : box.height;
  const start = (wide ? box.x : box.y) - length / 2;
  const anchor = wide ? undefined : anchorY.get(list[0]!.id);
  const mid = anchor !== undefined ? start + anchor : start + length / 2;
  const room = Math.max(0, length - 2 * M.corner);
  const n = list.length;
  const pitch = n > 1 ? Math.min(M.portPitch, room / (n - 1)) : 0;
  const first = Math.min(
    Math.max(mid - ((n - 1) * pitch) / 2, start + (length - room) / 2),
    start + (length + room) / 2 - (n - 1) * pitch
  );
  const face = wide
    ? box.y + (side === 'top' ? -1 : 1) * (box.height / 2)
    : box.x + (side === 'left' ? -1 : 1) * (box.width / 2);
  list.forEach((end, i) => {
    const along = n > 1 ? first + i * pitch : Math.min(Math.max(mid, start), start + length);
    end.at = wide ? { x: along, y: face } : { x: face, y: along };
  });
}

const out = (p: Point, side: Side, by: number): Point => ({
  x: p.x + NORMAL[side].x * by,
  y: p.y + NORMAL[side].y * by,
});

const point = (p: Point, from: Point | undefined, side?: Side): RoutePoint => {
  if (!from) return { x: p.x, y: p.y, axis: side && !across(side) ? 'h' : 'v' };
  return { x: p.x, y: p.y, axis: Math.abs(p.x - from.x) > Math.abs(p.y - from.y) ? 'h' : 'v' };
};

// The route's middle points, less the old end's own stub (a stepped route's first leg, straight
// out of the side it left by) at each end that moves, unless that is all the middle there is or
// it holds the label.
function middleOf(
  placed: LayoutModelEdge,
  m: Partial<Record<Which, End>>,
  label: { width: number; height: number } | undefined
): RoutePoint[] {
  const pts = placed.points;
  const middle = pts.slice(1, -1);
  const at = placed.label;
  const holdsLabel = (p: Point): boolean =>
    !!label &&
    !!at &&
    Math.abs(p.x - at.x) <= label.width / 2 + 1e-9 &&
    Math.abs(p.y - at.y) <= label.height / 2 + 1e-9;
  const isStub = (end: RoutePoint, p: RoutePoint | undefined, side: Side): boolean =>
    !!p &&
    !holdsLabel(p) &&
    (across(side) ? Math.abs(p.x - end.x) < 1e-9 : Math.abs(p.y - end.y) < 1e-9);
  if (m.source && middle.length > 1 && isStub(pts[0]!, middle[0], placed.ports.source))
    middle.shift();
  if (m.target && middle.length > 1 && isStub(pts.at(-1)!, middle.at(-1), placed.ports.target))
    middle.pop();
  return middle;
}

// A route with its moved ends redrawn: stubs out of the named sides, joined at right angles to
// the route's middle points, which stay as they are (the label sits among them).
function reroute(
  placed: LayoutModelEdge,
  m: Partial<Record<Which, End>>,
  boxes: { source: Box; target: Box },
  stub: (which: Which) => number,
  label: { width: number; height: number } | undefined
): LayoutModelEdge {
  const pts = placed.points;
  const first = pts[0]!;
  const last = pts.at(-1)!;
  const s = m.source;
  const t = m.target;
  const middle = middleOf(placed, m, label);
  const sSide = s?.side ?? placed.ports.source;
  const tSide = t?.side ?? placed.ports.target;
  const gap = Math.max(stub('source'), stub('target'));
  // Where each end now sits, and its stub's outer point: a kept end's own, where it has to join
  // the other directly.
  const sAt = s?.at ?? first;
  const tAt = t?.at ?? last;
  const sOut = s || middle.length === 0 ? out(sAt, sSide, stub('source')) : undefined;
  const tOut = t || middle.length === 0 ? out(tAt, tSide, stub('target')) : undefined;
  const route: Point[] = [];
  const fresh = new Set<Point>();
  const push = (p: Point, isNew: boolean): void => {
    route.push(p);
    if (isNew) fresh.add(p);
  };
  push(sAt, !!s);
  if (sOut) push(sOut, true);
  if (middle.length === 0) {
    const how = { fromSide: sSide, toSide: tSide, before: sAt, after: tAt, gap };
    for (const p of join(sOut!, tOut!, [boxes.source, boxes.target], how)) push(p, true);
  } else {
    if (s) {
      const how = { fromSide: sSide, before: sAt, after: middle[1] ?? tOut ?? last, gap };
      for (const p of join(sOut!, middle[0]!, [boxes.source], how)) push(p, true);
    }
    // A middle point next to a redrawn stretch may go where it ends up in line (fresh).
    middle.forEach((p, i) => push(p, (i === 0 && !!s) || (i === middle.length - 1 && !!t)));
    if (t) {
      const how = { toSide: tSide, before: middle.at(-2) ?? sOut ?? first, after: tAt, gap };
      for (const p of join(middle.at(-1)!, tOut!, [boxes.target], how)) push(p, true);
    }
  }
  if (tOut) push(tOut, true);
  push(tAt, !!t);
  // The label stays where it was.
  return {
    ...placed,
    points: finish(route, fresh, pts, sSide),
    ports: { source: sSide, target: tSide },
  };
}

// A self-loop with a named side: out of one side and back into the other (or the same one),
// round the box, its label beside the loop's outermost leg.
function loop(
  placed: LayoutModelEdge,
  m: Partial<Record<Which, End>>,
  box: Box,
  stub: (which: Which) => number,
  label: { width: number; height: number } | undefined,
  M: LayoutMetrics
): LayoutModelEdge {
  const pts = placed.points;
  const sSide = m.source?.side ?? placed.ports.source;
  const tSide = m.target?.side ?? placed.ports.target;
  const sAt = m.source?.at ?? pts[0]!;
  const tAt = m.target?.at ?? pts[pts.length - 1]!;
  const sOut = out(sAt, sSide, stub('source'));
  const tOut = out(tAt, tSide, stub('target'));
  const how = {
    fromSide: sSide,
    toSide: tSide,
    before: sAt,
    after: tAt,
    gap: Math.max(stub('source'), stub('target')),
  };
  const route = [sAt, sOut, ...join(sOut, tOut, [box], how), tOut, tAt];
  const all = new Set<Point>(route);
  const model: LayoutModelEdge = {
    points: finish(route, all, [], sSide),
    ports: { source: sSide, target: tSide },
  };
  if (label) {
    // The longest leg between the stubs, and the label just outside it, away from the box.
    let best = -1;
    let a: Point = sOut;
    let b: Point = tOut;
    const legs = model.points;
    for (let i = 2; i < legs.length - 1; i++) {
      const p = legs[i - 1]!;
      const q = legs[i]!;
      const len = Math.abs(q.x - p.x) + Math.abs(q.y - p.y);
      if (len > best) [best, a, b] = [len, p, q];
    }
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    if (Math.abs(a.y - b.y) < 1e-9) {
      const sign = my < box.y ? -1 : 1;
      model.label = { x: mx, y: my + sign * (M.loopGap + label.height / 2) };
    } else {
      const sign = mx < box.x ? -1 : 1;
      model.label = { x: mx + sign * (M.loopGap + label.width / 2), y: my };
    }
  }
  return model;
}

// Right-angled points from `from` to `to` (both outside the boxes), crossing none of `boxes` where
// it can: one bend, else two. `fromSide` is the side `from` sits out of (the route must not turn
// back into it); `toSide` likewise for `to`. Of equal choices, the one that turns least, counting
// the turns at `from` and `to` from and to their neighbours `before` and `after`, then the shortest.
// A way round a box keeps `gap` from it.
function join(
  from: Point,
  to: Point,
  boxes: readonly Box[],
  how: { fromSide?: Side; toSide?: Side; before: Point; after: Point; gap: number }
): Point[] {
  const { fromSide, toSide, before, after, gap } = how;
  const candidates: Point[][] = [
    [{ x: from.x, y: to.y }],
    [{ x: to.x, y: from.y }],
    [
      { x: from.x, y: (from.y + to.y) / 2 },
      { x: to.x, y: (from.y + to.y) / 2 },
    ],
    [
      { x: (from.x + to.x) / 2, y: from.y },
      { x: (from.x + to.x) / 2, y: to.y },
    ],
  ];
  for (const b of boxes) {
    for (const x of [b.x - b.width / 2 - gap, b.x + b.width / 2 + gap]) {
      candidates.push([
        { x, y: from.y },
        { x, y: to.y },
      ]);
    }
    for (const y of [b.y - b.height / 2 - gap, b.y + b.height / 2 + gap]) {
      candidates.push([
        { x: from.x, y },
        { x: to.x, y },
      ]);
    }
  }
  let best: Point[] = candidates[0]!;
  let bestScore = [Infinity, Infinity, Infinity];
  for (const c of candidates) {
    const path = dedupe([from, ...c, to]);
    const score = [
      cost(path, boxes, fromSide, toSide),
      turns(dedupe([before, ...path, after])),
      path.reduce(
        (sum, p, i) =>
          i ? sum + Math.abs(p.x - path[i - 1]!.x) + Math.abs(p.y - path[i - 1]!.y) : 0,
        0
      ),
    ];
    if (
      score[0]! < bestScore[0]! ||
      (score[0] === bestScore[0] &&
        (score[1]! < bestScore[1]! ||
          (score[1] === bestScore[1] && score[2]! < bestScore[2]! - 1e-9)))
    ) {
      best = c;
      bestScore = score;
    }
  }
  return dedupe([from, ...best, to]).slice(1, -1);
}

// How often a polyline changes direction.
function turns(path: readonly Point[]): number {
  let n = 0;
  for (let i = 2; i < path.length; i++) {
    const a = path[i - 2]!;
    const b = path[i - 1]!;
    const c = path[i]!;
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    const dot = (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y);
    if (Math.abs(cross) > 1e-9 || dot < 0) n++;
  }
  return n;
}

// Boxes crossed, plus a turn back into the side an end leaves or a run out past the side it
// enters by, each counted as a crossing.
function cost(
  path: readonly Point[],
  boxes: readonly Box[],
  fromSide: Side | undefined,
  toSide: Side | undefined
): number {
  let n = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    for (const box of boxes) if (crosses(a, b, box)) n++;
  }
  if (path.length >= 2) {
    const dir = (a: Point, b: Point): Point => ({
      x: Math.sign(b.x - a.x),
      y: Math.sign(b.y - a.y),
    });
    if (fromSide) {
      const d = dir(path[0]!, path[1]!);
      const nrm = NORMAL[fromSide];
      if (d.x === -nrm.x && d.y === -nrm.y) n++;
    }
    if (toSide) {
      const d = dir(path[path.length - 2]!, path[path.length - 1]!);
      const nrm = NORMAL[toSide];
      if (d.x === nrm.x && d.y === nrm.y) n++;
    }
  }
  return n;
}

// Whether the axis-aligned segment a–b runs through the inside of `box`.
function crosses(a: Point, b: Point, box: Box): boolean {
  const e = 0.5;
  const x0 = box.x - box.width / 2 + e;
  const x1 = box.x + box.width / 2 - e;
  const y0 = box.y - box.height / 2 + e;
  const y1 = box.y + box.height / 2 - e;
  return (
    Math.max(a.x, b.x) > x0 &&
    Math.min(a.x, b.x) < x1 &&
    Math.max(a.y, b.y) > y0 &&
    Math.min(a.y, b.y) < y1
  );
}

const same = (a: Point, b: Point): boolean =>
  Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9;

function dedupe(path: Point[]): Point[] {
  return path.filter((p, i) => i === 0 || !same(p, path[i - 1]!));
}

// The final points: repeats dropped, a fresh point (new, or a middle point next to a redrawn
// stretch) dropped where it sits in line between its neighbours, and each point's `axis` set from
// the leg into it where that leg is new. Points whose leg in is unchanged are kept as they were.
function finish(
  route: readonly Point[],
  fresh: ReadonlySet<Point>,
  kept: readonly RoutePoint[],
  first: Side
): RoutePoint[] {
  const pts: Point[] = [];
  for (const p of route) {
    const last = pts[pts.length - 1];
    if (last && same(last, p)) {
      if (fresh.has(last) && !fresh.has(p)) pts[pts.length - 1] = p;
      continue;
    }
    const before = pts[pts.length - 2];
    const inLine =
      last &&
      before &&
      ((Math.abs(before.x - last.x) < 1e-9 && Math.abs(last.x - p.x) < 1e-9) ||
        (Math.abs(before.y - last.y) < 1e-9 && Math.abs(last.y - p.y) < 1e-9));
    if (inLine && fresh.has(last)) pts.pop();
    pts.push(p);
  }
  const at = new Map<Point, number>();
  kept.forEach((p, i) => at.set(p, i));
  return pts.map((p, i) => {
    const prev = pts[i - 1];
    const k = at.get(p);
    const unchanged =
      k !== undefined && (i === 0 ? k === 0 : prev !== undefined && at.get(prev) === k - 1);
    if (unchanged) return p as RoutePoint;
    return point(p, prev, i === 0 ? first : undefined);
  });
}

// Shifts the whole model so the redrawn routes (and their labels) keep `margin` clear of the
// drawing's edge, and grows the drawing to hold them.
function fit(model: LayoutModel, lo: Point, hi: Point, margin: number): void {
  const dx = Math.max(0, margin - lo.x);
  const dy = Math.max(0, margin - lo.y);
  const width = Math.max(model.width + dx, hi.x + dx + margin);
  const height = Math.max(model.height + dy, hi.y + dy + margin);
  if (dx > 0 || dy > 0) {
    for (const n of model.nodes.values()) {
      n.x += dx;
      n.y += dy;
    }
    for (const g of model.groups.values()) {
      g.x += dx;
      g.y += dy;
      g.title = { x: g.title.x + dx, y: g.title.y + dy };
    }
    for (const [id, e] of model.edges) {
      const moved: LayoutModelEdge = {
        ...e,
        points: e.points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })),
      };
      for (const k of ['label', 'startLabel', 'endLabel'] as const) {
        const at = e[k];
        if (at) moved[k] = { x: at.x + dx, y: at.y + dy };
      }
      model.edges.set(id, moved);
    }
  }
  model.width = width;
  model.height = height;
}
