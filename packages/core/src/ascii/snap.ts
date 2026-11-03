// Route snapping for text output (DESIGN §6.3, D78, R-ASCII-1). The layered engine lays the
// ASCII path out with `grid` set (D140), so its route points are already cell indices; snapping
// is a cheap guard on top (research/ascii-snapping.md, recommendation item 4): quantise before
// rounding so float noise at `.5` cannot split a run, square any diagonal with a knee, and drop
// duplicate and collinear points.
import type { Point, RoutePoint } from '../layout/types.ts';

/** Float noise below this is not a position (research example 2). */
const QUANTUM = 1e4;

const cell = (v: number, grid: number): number =>
  Math.round(Math.round((v / grid) * QUANTUM) / QUANTUM);

/**
 * Turns a `LayoutModel` edge route into a cell polyline: the cell outside the source border,
 * every bend, then the arrowhead cell outside the target border. Consecutive points share a
 * row or a column. A diagonal pair gets a knee chosen by the later point's `axis` (how the route
 * reaches it). Coordinates are divided by `grid`, so the result is in cell indices.
 */
export function snapRoute(points: readonly RoutePoint[], grid = 1): Point[] {
  const out: Point[] = [];
  const push = (p: Point): void => {
    const last = out[out.length - 1];
    if (last && last.x === p.x && last.y === p.y) return;
    const before = out[out.length - 2];
    if (
      last &&
      before &&
      (before.x === last.x) === (last.x === p.x) &&
      (before.y === last.y) === (last.y === p.y)
    )
      out.pop();
    out.push(p);
  };
  for (const p of points) {
    const next = { x: cell(p.x, grid), y: cell(p.y, grid) };
    const last = out[out.length - 1];
    if (last && last.x !== next.x && last.y !== next.y)
      push(p.axis === 'v' ? { x: next.x, y: last.y } : { x: last.x, y: next.y });
    push(next);
  }
  return out;
}
