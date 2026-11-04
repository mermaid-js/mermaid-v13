import type { EndMarker, RoutePoint } from '../types.ts';

/** A box: left, top, right, bottom. */
export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * The box a marker at the end `points[0]` is drawn in (`LayoutEdge.startMarker`, #201): out along
 * the first leg (its own direction on straight routes, else straight `out` of the end's side),
 * `marker.width` across, centred on the line.
 */
export function markerRect(
  points: readonly RoutePoint[],
  out: { axis: 'x' | 'y'; sign: 1 | -1 },
  marker: EndMarker,
  straight: boolean
): Rect {
  const a = points[0]!;
  const b = points[1] ?? a;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const side = { x: out.axis === 'x' ? out.sign : 0, y: out.axis === 'y' ? out.sign : 0 };
  const along = straight && len > 0;
  const dx = along ? (b.x - a.x) / len : side.x;
  const dy = along ? (b.y - a.y) / len : side.y;
  const h = marker.width / 2;
  const r = marker.length;
  const xs = [a.x - dy * h, a.x + dy * h, a.x + dx * r - dy * h, a.x + dx * r + dy * h];
  const ys = [a.y + dx * h, a.y - dx * h, a.y + dy * r + dx * h, a.y + dy * r - dx * h];
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}
