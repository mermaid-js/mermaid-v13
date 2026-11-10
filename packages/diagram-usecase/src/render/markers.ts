/**
 * Relationship end markers, drawn as paths in each relationship's group (no `<defs>`/`<marker>`,
 * DESIGN §7.1), as the flowchart and class renderers draw theirs: v12's classic point, circle and
 * cross (`markers.js`, the shapes the flowchart's classic arrowheads take) and the extension's
 * hollow triangle for a generalization (`metrics.ts` `MARKER`).
 */
import type { Attrs, OutlinePaint, Paint, SvgWriter } from '@mermaid-js/core/svg';
import type { MarkerType } from '../layout/prepare.ts';
import { MARKER } from './metrics.ts';

/** Where a line meets a node outline, and the unit direction it travels there. */
export interface LineEnd {
  readonly x: number;
  readonly y: number;
  readonly dx: number;
  readonly dy: number;
}

/**
 * How far the line stops short of the node outline: under the point's back, to the circle's and
 * the cross's centre, to the triangle's base (so it never shows inside the hollow triangle).
 */
export function markerTrim(type: MarkerType): number {
  switch (type) {
    case 'point':
      return MARKER.pointLength - 1;
    case 'circle':
      return MARKER.circleGap + MARKER.circleSize / 2;
    case 'cross':
      return MARKER.crossGap + MARKER.crossSize / 2;
    case 'extension':
      return MARKER.extensionLength;
    case 'none':
      return 0;
  }
}

/** One marker's paint: the line's colour, and the triangle's hollow fill. */
export interface MarkerPaint {
  readonly line: OutlinePaint;
  readonly hollow?: Paint;
  /** The line's opacity, which its marker keeps. */
  readonly opacity?: Attrs['opacity'];
}

/** Draws the marker for a line that meets the outline at `end`, travelling along (dx, dy). */
export function marker(w: SvgWriter, type: MarkerType, end: LineEnd, paint: MarkerPaint): void {
  if (type === 'none') return;
  const { x, y, dx, dy } = end;
  // Across the line, one unit.
  const ax = -dy;
  const ay = dx;
  const at = (back: number, across: number): [number, number] => [
    x - dx * back + ax * across,
    y - dy * back + ay * across,
  ];
  const base = { class: `marker ${type}`, opacity: paint.opacity };
  if (type === 'point' || type === 'extension') {
    const point = type === 'point';
    const len = point ? MARKER.pointLength : MARKER.extensionLength;
    const half = (point ? MARKER.pointWidth : MARKER.extensionWidth) / 2;
    const d = w
      .path()
      .moveTo(...at(0, 0))
      .lineTo(...at(len, half))
      .lineTo(...at(len, -half))
      .close()
      .done();
    w.leaf(
      'path',
      point
        ? { ...base, d, fill: paint.line, stroke: 'none' }
        : {
            ...base,
            d,
            fill: paint.hollow ?? paint.line,
            stroke: paint.line,
            'stroke-width': MARKER.extensionStroke,
            'stroke-linejoin': 'miter',
          }
    );
    return;
  }
  if (type === 'circle') {
    const r = MARKER.circleSize / 2;
    const [cx, cy] = at(MARKER.circleGap + r, 0);
    // Two half arcs: a circle as one path.
    const d = w
      .path()
      .moveTo(cx - r, cy)
      .arcTo(r, r, 0, false, true, cx + r, cy)
      .arcTo(r, r, 0, false, true, cx - r, cy)
      .close()
      .done();
    w.leaf('path', { ...base, d, fill: paint.line, stroke: 'none' });
    return;
  }
  // The cross: the diagonals of a square of side `crossSize`, `crossGap` off the outline.
  const half = MARKER.crossSize / 2;
  const back = MARKER.crossGap + half;
  const d = w
    .path()
    .moveTo(...at(back - half, half))
    .lineTo(...at(back + half, -half))
    .moveTo(...at(back - half, -half))
    .lineTo(...at(back + half, half))
    .done();
  w.leaf('path', {
    ...base,
    d,
    fill: 'none',
    stroke: paint.line,
    'stroke-width': MARKER.crossStroke,
  });
}
