// Relation end markers, drawn inline beside each line (no <defs>/<marker>, DESIGN §7.1). The
// shapes are v12's (`rendering-elements/markers.js:869-958` at fa796a943): `requirement_arrow`,
// an open chevron whose tip is on the target's outline, and `requirement_contains`, a circle
// with a plus starting at the source's outline. Where v12 drew `look: neo` from the `_neo`
// copies, the difference is theme geometry (D152): the stroke width and the chevron's scale
// (`MarkerGeometry`, the same values the layout sized the marker room from). Markers are never
// sketched (D301): v12 drew them plain under `look: handDrawn`.
import type { Paint, SvgWriter } from '@mermaid-js/core/svg';
import { REQUIREMENT_METRICS as M, type MarkerGeometry } from '../layout/metrics.ts';

/** Where a line meets a box outline, and the unit direction from there out along the line. */
export interface MarkerEnd {
  readonly x: number;
  readonly y: number;
  readonly ux: number;
  readonly uy: number;
}

/** Draws a relation's marker at `end` in `stroke`, as `geometry` sizes it. */
export function drawMarker(
  w: SvgWriter,
  marker: 'contains' | 'arrow',
  end: MarkerEnd,
  stroke: Paint,
  geometry: MarkerGeometry,
  dataId: string
): void {
  const { x, y, ux, uy } = end;
  // Across the line.
  const nx = -uy;
  const ny = ux;
  if (marker === 'contains') {
    const { cx, r } = M.circle;
    const ox = x + ux * cx;
    const oy = y + uy * cx;
    const plus = w
      .path()
      .moveTo(ox - ux * r, oy - uy * r)
      .lineTo(ox + ux * r, oy + uy * r)
      .moveTo(ox - nx * r, oy - ny * r)
      .lineTo(ox + nx * r, oy + ny * r)
      .done();
    w.open('g', { class: 'marker requirement_contains', 'data-id': dataId });
    w.leaf('circle', { cx: ox, cy: oy, r, fill: 'none', stroke, 'stroke-width': geometry.stroke });
    w.leaf('path', { d: plus, fill: 'none', stroke, 'stroke-width': geometry.stroke });
    w.close();
    return;
  }
  // Two strokes from the back to the tip, each its own subpath (v12's `M0,0 L20,10 M20,10
  // L0,20`), so the tip has butt caps and no join; the stroke scales with the chevron.
  const k = geometry.arrowScale;
  const bx = x + ux * M.chevron.length * k;
  const by = y + uy * M.chevron.length * k;
  const hx = (nx * M.chevron.width * k) / 2;
  const hy = (ny * M.chevron.width * k) / 2;
  const d = w
    .path()
    .moveTo(bx + hx, by + hy)
    .lineTo(x, y)
    .moveTo(x, y)
    .lineTo(bx - hx, by - hy)
    .done();
  w.leaf('path', {
    class: 'marker requirement_arrow',
    'data-id': dataId,
    d,
    fill: 'none',
    stroke,
    'stroke-width': geometry.stroke * k,
  });
}
