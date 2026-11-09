// Edge ends on an oval (spec #517 T3): every engine ends a route on the node's box, and an oval
// use case's box only touches the oval at the middle of each side. So each end on an oval is
// moved along its last segment, extended, to where that line meets the oval (v12's
// `intersect.ellipse`). No core helper clips to an ellipse; this is the only one.
import type {
  LayoutModel,
  LayoutModelEdge,
  LayoutModelNode,
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

const axisOf = (from: { x: number; y: number }, to: { x: number; y: number }): 'h' | 'v' =>
  Math.abs(to.x - from.x) >= Math.abs(to.y - from.y) ? 'h' : 'v';

/**
 * The route with its last point on the oval: from the last point outside the oval, along the line
 * through the point after it, to where that line enters the oval. A line that misses the oval
 * (it can only run past an end left outside) takes one more step, toward the oval's centre.
 */
function clipLast(points: readonly RoutePoint[], o: Oval): RoutePoint[] {
  let k = points.length - 2;
  while (k >= 0 && ovalLevel(o, points[k]!) < 1) k--;
  if (k < 0) return [...points];
  const a = points[k]!;
  const b = points[k + 1]!;
  const u = (a.x - o.cx) / o.rx;
  const v = (a.y - o.cy) / o.ry;
  const du = (b.x - a.x) / o.rx;
  const dv = (b.y - a.y) / o.ry;
  const qa = du * du + dv * dv;
  const qb = 2 * (u * du + v * dv);
  const qc = u * u + v * v - 1;
  const disc = qb * qb - 4 * qa * qc;
  const kept = points.slice(0, k + 1);
  if (qa > 0 && disc >= 0) {
    const s = (-qb - Math.sqrt(disc)) / (2 * qa);
    if (s >= 0)
      return [...kept, { x: a.x + s * (b.x - a.x), y: a.y + s * (b.y - a.y), axis: b.axis }];
  }
  const level = ovalLevel(o, b);
  if (level === 0) return [...points];
  const r = Math.sqrt(level);
  const hit = { x: o.cx + (b.x - o.cx) / r, y: o.cy + (b.y - o.cy) / r };
  return [...kept, b, { ...hit, axis: axisOf(b, hit) }];
}

/** An edge with its ends on `source` and `target`, where each is an oval. */
export function clipEdge(edge: LayoutModelEdge, source?: Oval, target?: Oval): LayoutModelEdge {
  let points = edge.points;
  if (target) points = clipLast(points, target);
  if (source) {
    const back = clipLast([...points].reverse(), source).reverse();
    // The first point keeps the axis the route leaves by.
    back[0] = { ...back[0]!, axis: points[0]!.axis };
    points = back;
  }
  return points === edge.points ? edge : { ...edge, points };
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
