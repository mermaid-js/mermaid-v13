/**
 * Node outlines (spec #294 T4, D302, D309): every shape goes through `w.outline`, so an
 * extension's drawer (hand-drawn) replaces it; the default node too, which v12 never sketched
 * (D308). Coordinates are absolute: `x`, `y` is the frame's centre in the drawing.
 */
import type { Attrs, SvgWriter } from '@mermaid-js/core/svg';
import type { MindmapNodeView } from '../layout/prepare.ts';

/** v12 `defaultMindmapNode.ts`: the corner of the plain node, `rd = 5`. */
const PLAIN_CORNER = 5;

export interface OutlineStyle {
  /** The rounded shape's corner (`radius`). */
  readonly radius: number;
  /** Plain nodes have a flat bottom (v12 neo). */
  readonly flat: boolean;
}

/** The plain node: rounded corners, the bottom ones square when `flat`. */
function plainPath(w: SvgWriter, x0: number, y0: number, x1: number, y1: number, flat: boolean) {
  const r = Math.max(0, Math.min(PLAIN_CORNER, (x1 - x0) / 2, (y1 - y0) / 2));
  const p = w
    .path()
    .moveTo(x0, y1 - r)
    .lineTo(x0, y0 + r)
    .quadTo(x0, y0, x0 + r, y0)
    .lineTo(x1 - r, y0)
    .quadTo(x1, y0, x1, y0 + r);
  if (flat) p.lineTo(x1, y1).lineTo(x0, y1);
  else
    p.lineTo(x1, y1 - r)
      .quadTo(x1, y1, x1 - r, y1)
      .lineTo(x0 + r, y1)
      .quadTo(x0, y1, x0, y1 - r);
  return p.close().done();
}

/** A cloud's or a bang's arcs (`layout/outline.ts`), moved to the frame's centre. */
function arcPath(w: SvgWriter, v: MindmapNodeView, x: number, y: number) {
  const o = v.outline!;
  const p = w.path().moveTo(x + o.start.x, y + o.start.y);
  for (const a of o.arcs) p.arcTo(a.rx, a.ry, a.rotation, a.large, a.sweep, x + a.x, y + a.y);
  return p.close().done();
}

/** Draws node `v`'s shape centred at (`x`, `y`) with `paint` (class, fill, stroke, filter). */
export function nodeOutline(
  w: SvgWriter,
  v: MindmapNodeView,
  x: number,
  y: number,
  paint: Attrs,
  style: OutlineStyle
): void {
  const { width, height } = v.frame;
  const x0 = x - width / 2;
  const y0 = y - height / 2;
  switch (v.shape) {
    case 'circle':
      w.outline('node', 'circle', { cx: x, cy: y, r: width / 2, ...paint });
      return;
    case 'rect':
      w.outline('node', 'rect', { x: x0, y: y0, width, height, ...paint });
      return;
    case 'rounded':
      w.outline('node', 'rect', { x: x0, y: y0, width, height, rx: style.radius, ...paint });
      return;
    case 'hexagon': {
      const m = v.point ?? 0;
      const x1 = x0 + width;
      const y1 = y0 + height;
      const points = [x0 + m, y0, x1 - m, y0, x1, y, x1 - m, y1, x0 + m, y1, x0, y];
      w.outline('node', 'polygon', { points, ...paint });
      return;
    }
    case 'cloud':
    case 'bang':
      w.outline('node', 'path', { d: arcPath(w, v, x, y), ...paint });
      return;
    case 'default':
      w.outline('node', 'path', {
        d: plainPath(w, x0, y0, x0 + width, y0 + height, style.flat),
        ...paint,
      });
  }
}
