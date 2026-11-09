// Edge ends on an oval (spec #517 T3): every engine ends a route on the node's box, and an oval
// use case's box only touches the oval at the middle of each side. So each end on an oval is
// moved along its last segment, extended, to where that line meets the oval (v12's
// `intersect.ellipse`). No core helper clips to an ellipse; this is the only one.
import type {
  LayoutModel,
  LayoutModelEdge,
  LayoutModelNode,
  Point,
  RoutePoint,
} from '@mermaid-js/core/layout';

/** An oval: its centre and radii. */
export interface Oval {
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
}

/** The oval a placed node's box holds. */
export function ovalOf(n: LayoutModelNode): Oval {
  return { cx: n.x, cy: n.y, rx: n.width / 2, ry: n.height / 2 };
}

/** `(x − cx)² / rx² + (y − cy)² / ry²`: 1 on the oval, below 1 inside it. */
export function ovalLevel(o: Oval, p: { x: number; y: number }): number {
  const u = (p.x - o.cx) / o.rx;
  const v = (p.y - o.cy) / o.ry;
  return u * u + v * v;
}

const axisOf = (from: Point, to: Point): 'h' | 'v' =>
  Math.abs(to.x - from.x) >= Math.abs(to.y - from.y) ? 'h' : 'v';

const same = (a: Point, b: Point): boolean => a.x === b.x && a.y === b.y;

/** How near 0 a step along a segment counts as no step (a point already on the oval). */
const NO_STEP = 1e-9;

/**
 * Where a route's end is cut, read from its far end toward the end being clipped (`seq`):
 * - `keep`: how many points of `seq` stay, from its start;
 * - `hit`: the point on the oval added after them, if any (none: the last kept one is on it);
 * - `stepped`: the end missed the oval along its line, so it stays and `hit` follows it,
 *   toward the oval's centre.
 */
interface Cut {
  readonly keep: number;
  readonly hit?: Point;
  readonly stepped: boolean;
}

/**
 * From the last point outside the oval, along the line through the point after it, to where
 * that line enters the oval. Trailing copies of the end count as one point. Undefined when
 * nothing changes: a flat oval (no width or no height), or a route wholly inside the oval
 * (its nodes overlap; it is left as the engine drew it).
 */
function cut(seq: readonly RoutePoint[], o: Oval): Cut | undefined {
  if (!(o.rx > 0 && o.ry > 0 && Number.isFinite(o.rx) && Number.isFinite(o.ry))) return undefined;
  let end = seq.length - 1;
  while (end > 0 && same(seq[end - 1]!, seq[end]!)) end--;
  let k = end - 1;
  while (k >= 0 && ovalLevel(o, seq[k]!) < 1) k--;
  if (k < 0) return undefined;
  const a = seq[k]!;
  const b = seq[k + 1]!;
  const u = (a.x - o.cx) / o.rx;
  const v = (a.y - o.cy) / o.ry;
  const du = (b.x - a.x) / o.rx;
  const dv = (b.y - a.y) / o.ry;
  const qa = du * du + dv * dv;
  const qb = 2 * (u * du + v * dv);
  const qc = u * u + v * v - 1;
  const disc = qb * qb - 4 * qa * qc;
  if (disc >= 0) {
    const s = (-qb - Math.sqrt(disc)) / (2 * qa);
    if (s >= -NO_STEP) {
      if (s <= NO_STEP) return { keep: k + 1, stepped: false };
      return {
        keep: k + 1,
        hit: { x: a.x + s * (b.x - a.x), y: a.y + s * (b.y - a.y) },
        stepped: false,
      };
    }
  }
  // The line runs past the oval, so `b` is the end, left outside: one step toward the centre.
  const r = Math.sqrt(ovalLevel(o, b));
  if (r === 0) return undefined;
  return {
    keep: k + 2,
    hit: { x: o.cx + (b.x - o.cx) / r, y: o.cy + (b.y - o.cy) / r },
    stepped: true,
  };
}

/**
 * The route with its last point on the oval. `RoutePoint.axis` is how the route runs into a
 * point: a hit on the last leg runs in as the point it replaces did; a step toward the centre
 * runs in along itself.
 */
function clipLast(points: readonly RoutePoint[], o: Oval): readonly RoutePoint[] {
  const c = cut(points, o);
  if (!c) return points;
  const kept = points.slice(0, c.keep);
  if (!c.hit) return kept;
  const from = kept[kept.length - 1]!;
  const axis = c.stepped ? axisOf(from, c.hit) : points[c.keep]!.axis;
  return [...kept, { ...c.hit, axis }];
}

/**
 * The route with its first point on the oval. The first point's axis is the one the route
 * leaves by: the old first point's while the first leg is the same one, else the leg's own
 * (the axis the route ran into its far point with). A step toward the centre leaves along
 * itself, and the old first point then runs in from it.
 */
function clipFirst(points: readonly RoutePoint[], o: Oval): readonly RoutePoint[] {
  const c = cut([...points].reverse(), o);
  if (!c) return points;
  const n = points.length;
  const kept = points.slice(n - c.keep);
  if (c.stepped) {
    const [b, ...rest] = kept;
    const axis = axisOf(c.hit!, b!);
    return [{ ...c.hit!, axis }, { ...b!, axis }, ...rest];
  }
  // `kept[0]` is the first point left; the legs before it are gone or cut.
  const first = n - c.keep;
  if (!c.hit) {
    const [a, ...rest] = kept;
    return [{ ...a!, axis: rest[0]?.axis ?? a!.axis }, ...rest];
  }
  const axis = first === 1 ? points[0]!.axis : kept[0]!.axis;
  return [{ ...c.hit, axis }, ...kept];
}

/** An edge with its ends on `source` and `target`, where each is an oval. */
export function clipEdge(edge: LayoutModelEdge, source?: Oval, target?: Oval): LayoutModelEdge {
  let points: readonly RoutePoint[] = edge.points;
  if (target) points = clipLast(points, target);
  if (source) points = clipFirst(points, source);
  return points === edge.points ? edge : { ...edge, points: [...points] };
}

/** The model with every edge end on an oval node moved onto the oval. */
export function clipToOvals(
  model: LayoutModel,
  ends: ReadonlyMap<string, { readonly source: string; readonly target: string }>,
  isOval: (id: string) => boolean
): LayoutModel {
  const edges = new Map<string, LayoutModelEdge>();
  for (const [id, placed] of model.edges) {
    const e = ends.get(id);
    const s = e && isOval(e.source) ? model.nodes.get(e.source) : undefined;
    const t = e && isOval(e.target) ? model.nodes.get(e.target) : undefined;
    edges.set(id, clipEdge(placed, s && ovalOf(s), t && ovalOf(t)));
  }
  return { ...model, edges };
}
