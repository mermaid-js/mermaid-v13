/**
 * Edges (spec #294 T4): v12 drew each with `curve: 'basis'` through its engine's points. A route
 * of two points (what `tree` gives, port to port) becomes one cubic that leaves and enters along
 * its ports, as v12 tidy-tree's elbows made the basis curve do; longer routes (`layered`, ELK)
 * are d3's basis spline. Both stay inside their points' hull, so the layout's bounds hold. Every
 * edge goes through `w.outline('edge', …)` (D302, D309).
 */
import type { LayoutModelEdge, RoutePoint, Side } from '@mermaid-js/core/layout';
import type { Attrs, PathBuilder, PathData, SvgWriter } from '@mermaid-js/core/svg';

const across = (side: Side): boolean => side === 'left' || side === 'right';

/** d3 `curveBasis` through `pts` (three or more). */
function basis(p: PathBuilder, pts: readonly RoutePoint[]): void {
  const [a, b] = pts;
  p.moveTo(a!.x, a!.y).lineTo((5 * a!.x + b!.x) / 6, (5 * a!.y + b!.y) / 6);
  for (let i = 2; i <= pts.length; i++) {
    const p0 = pts[i - 2]!;
    const p1 = pts[i - 1]!;
    const p2 = pts[Math.min(i, pts.length - 1)]!;
    p.curveTo(
      (2 * p0.x + p1.x) / 3,
      (2 * p0.y + p1.y) / 3,
      (p0.x + 2 * p1.x) / 3,
      (p0.y + 2 * p1.y) / 3,
      (p0.x + 4 * p1.x + p2.x) / 6,
      (p0.y + 4 * p1.y + p2.y) / 6
    );
  }
  const last = pts[pts.length - 1]!;
  p.lineTo(last.x, last.y);
}

/** The `d` of a routed edge. */
export function edgePath(w: SvgWriter, route: LayoutModelEdge): PathData {
  const pts = route.points;
  const p = w.path();
  if (pts.length > 2) {
    basis(p, pts);
    return p.done();
  }
  const a = pts[0]!;
  const b = pts[pts.length - 1]!;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const [c1x, c1y] = across(route.ports.source) ? [mx, a.y] : [a.x, my];
  const [c2x, c2y] = across(route.ports.target) ? [mx, b.y] : [b.x, my];
  return p.moveTo(a.x, a.y).curveTo(c1x, c1y, c2x, c2y, b.x, b.y).done();
}

/** One edge line, with its classes and paint on the call (the drawer sees only these). */
export function drawEdge(w: SvgWriter, route: LayoutModelEdge, attrs: Attrs): void {
  w.outline('edge', 'path', { d: edgePath(w, route), fill: 'none', ...attrs });
}
