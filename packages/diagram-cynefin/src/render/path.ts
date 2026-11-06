/**
 * Path data for the layout's curves, through core's path builder (two decimals, `num()`): what
 * the renderer writes as `d`. The conformance gates read `curveData` and `ellipseData` too
 * (`./testing`), to compare the boundaries with v12's generator.
 */
import { pathBuilder } from '@mermaid-js/core/svg';
import type { PathData } from '@mermaid-js/core/svg';
import type { CubicCurve, CynefinEllipse, CynefinTransitionLayout } from '../layout/types.ts';

/** `M from C c1 c2 to …`. */
export function curveData(curve: CubicCurve): PathData {
  const b = pathBuilder().moveTo(curve.from.x, curve.from.y);
  for (const s of curve.segments) b.curveTo(s.c1.x, s.c1.y, s.c2.x, s.c2.y, s.to.x, s.to.y);
  return b.done();
}

/** v12's ellipse: two `A rx,ry 0 1,1` half arcs from the left end, then `Z`. */
export function ellipseData(e: CynefinEllipse): PathData {
  const { x, y } = e.center;
  return pathBuilder()
    .moveTo(x - e.rx, y)
    .arcTo(e.rx, e.ry, 0, true, true, x + e.rx, y)
    .arcTo(e.rx, e.ry, 0, true, true, x - e.rx, y)
    .close()
    .done();
}

/** A transition's line: `M start Q control end`. */
export function transitionData(t: CynefinTransitionLayout): PathData {
  return pathBuilder()
    .moveTo(t.start.x, t.start.y)
    .quadTo(t.control.x, t.control.y, t.end.x, t.end.y)
    .done();
}

/** A transition's arrowhead: the closed triangle. */
export function arrowheadData(t: CynefinTransitionLayout): PathData {
  const [a, tip, b] = t.head;
  return pathBuilder().moveTo(a.x, a.y).lineTo(tip.x, tip.y).lineTo(b.x, b.y).close().done();
}
