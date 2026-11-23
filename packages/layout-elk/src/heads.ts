/** Where an edge label goes for the arrowheads its edge has (D682). */
import type { LayoutEdge, Point } from '@mermaid-js/core/layout';

/**
 * Label centre `c` moved `by` along the leg of `points` it sits on, toward the end without an
 * arrowhead, so that the label is midway along the line that shows (D682, as `layered` does).
 * With heads at both ends or none it stays.
 */
export function offHead(points: Point[], c: Point, by: number, heads: LayoutEdge['heads']): Point {
  const target = heads?.target ?? true;
  if (target === (heads?.source ?? false)) return c;
  let nearest = Infinity;
  let along = { x: 0, y: 0 };
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len === 0) continue;
    const t = Math.min(
      1,
      Math.max(0, ((c.x - a.x) * (b.x - a.x) + (c.y - a.y) * (b.y - a.y)) / len ** 2)
    );
    const off = Math.hypot(a.x + t * (b.x - a.x) - c.x, a.y + t * (b.y - a.y) - c.y);
    if (off < nearest) {
      nearest = off;
      along = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    }
  }
  const s = target ? -by : by;
  return { x: c.x + s * along.x, y: c.y + s * along.y };
}
