// Class relationship end markers, drawn inline in each edge's group (no <defs>/<marker>,
// DESIGN §7.1). Shapes are v12's (rendering-elements/markers.js at fa796a943): the diamond of
// aggregation and composition, the triangle of extension, the notched arrow of dependency and
// the circle of a lollipop, each pointing at the node outline.
import type { Length, Paint, SvgWriter } from '@mermaid-js/core/svg';
import type { RelationType } from '../parser/index.ts';

/** Where a line meets a node outline, and the unit direction it travels there. */
export interface LineEnd {
  readonly x: number;
  readonly y: number;
  readonly dx: number;
  readonly dy: number;
}

/** What every marker of one render is painted with. */
export interface MarkerPaint {
  /** The line colour: outlines, and the fill of composition and dependency. */
  readonly line: Paint;
  /** The lollipop's fill (v12 `.lollipop { fill: mainBkg }`). */
  readonly hollow: Paint;
  /** The outline width as written (`strokeWidth`), and as a number for the geometry. */
  readonly width: Length;
  readonly strokeWidth: number;
}

/**
 * Every marker is at most 12 px across, outline included, so a multiplicity placed the engine's
 * `endLabelAcross` off the line never meets it (GAPS #155). v12's shapes were 12 across their
 * centre line.
 */
const ACROSS = 12;
/** Tip to far end of the diamond and the triangle (v12 x 1 → 18). */
const LONG = 17;
/** Tip to back of the dependency arrow, and to its notch (v12 x 9 → 18, notch at 14). */
const ARROW = 9;
const NOTCH = 4;
/** The lollipop circle's centre from the outline (v12 `cx` 7 with `refX` 1). */
const LOLLIPOP_AT = 7;
/** How far the line stops short of the outline: under the marker, never inside a hollow one. */
const TRIM: Readonly<Record<RelationType, number>> = {
  none: 0,
  aggregation: LONG,
  composition: LONG,
  extension: LONG,
  dependency: NOTCH,
  lollipop: LOLLIPOP_AT + ACROSS / 2,
};

/** How far a marker of this type shortens the line from the node outline. */
export const markerTrim = (type: RelationType): number => TRIM[type];

/** How long a marker is along the line, from the outline (for tests and clearance checks). */
export const MARKER_LENGTH: Readonly<Record<RelationType, number>> = {
  none: 0,
  aggregation: LONG,
  composition: LONG,
  extension: LONG,
  dependency: ARROW,
  lollipop: LOLLIPOP_AT + ACROSS / 2,
};

/** The widest any marker is across the line, outline included. */
export const MARKER_ACROSS = ACROSS;

/**
 * Draws the marker for a line that meets the outline at `end`, travelling along (dx, dy). The
 * tip touches the outline, as v12's markers did in every look (MIGRATION.md).
 */
export function marker(w: SvgWriter, type: RelationType, end: LineEnd, paint: MarkerPaint): void {
  if (type === 'none') return;
  const { x, y, dx, dy } = end;
  const sw = Math.max(0, Math.min(paint.strokeWidth, 4));
  const half = ACROSS / 2 - sw / 2;
  // Across the line, half the marker's width.
  const ax = -dy * half;
  const ay = dx * half;
  const back = (n: number): [number, number] => [x - dx * n, y - dy * n];
  if (type === 'lollipop') {
    const [cx, cy] = back(LOLLIPOP_AT);
    w.leaf('circle', {
      class: 'marker lollipop',
      cx,
      cy,
      r: half,
      fill: paint.hollow,
      stroke: paint.line,
      'stroke-width': paint.width,
    });
    return;
  }
  // The tip sits half the outline back, so the outline ends on the node's.
  const [tx, ty] = back(sw / 2);
  const b = w.path().moveTo(tx, ty);
  if (type === 'dependency') {
    const [bx, by] = back(sw / 2 + ARROW);
    const [nx, ny] = back(sw / 2 + NOTCH);
    b.lineTo(bx + ax, by + ay)
      .lineTo(nx, ny)
      .lineTo(bx - ax, by - ay);
  } else if (type === 'extension') {
    const [bx, by] = back(LONG);
    b.lineTo(bx + ax, by + ay).lineTo(bx - ax, by - ay);
  } else {
    const [mx, my] = back((LONG + sw / 2) / 2);
    const [fx, fy] = back(LONG);
    b.lineTo(mx + ax, my + ay)
      .lineTo(fx, fy)
      .lineTo(mx - ax, my - ay);
  }
  const filled = type === 'composition' || type === 'dependency';
  w.leaf('path', {
    class: `marker ${type}`,
    d: b.close().done(),
    fill: filled ? paint.line : 'none',
    stroke: paint.line,
    'stroke-width': paint.width,
    'stroke-linejoin': 'miter',
  });
}
