// Class relationship end markers, drawn inline in each edge's group (no <defs>/<marker>,
// DESIGN §7.1). Shapes are v12's (rendering-elements/markers.js at fa796a943): the diamond of
// aggregation and composition, the triangle of extension, the notched arrow of dependency and
// the circle of a lollipop. Where v12 drew `look: neo` from its `*-margin` variants, the
// difference is theme geometry (D152): `classMarkerStrokeWidth`, `classFilledMarkerStrokeWidth`,
// `extensionMarkerLength` and the `…MarkerGap` variables, read as numbers.
import type { Paint, SvgWriter } from '@mermaid-js/core/svg';
import type { Theme } from '@mermaid-js/core/theme';
import type { RelationType } from '../parser/index.ts';
import type { LineEnd } from '@mermaid-js/shared/svg/arrowheads';

/** One render's marker geometry and paint. */
export interface Markers {
  /** The line colour: outlines, and the fill of composition and dependency. */
  readonly line: Paint;
  /** The lollipop's fill (v12 `.lollipop { fill: mainBkg }`). */
  readonly hollow: Paint;
  /** Outline widths of the hollow and the filled markers. */
  readonly hollowWidth: number;
  readonly filledWidth: number;
  /** Tip to back, and the tip's distance from the node outline, by type. */
  readonly length: Readonly<Record<RelationType, number>>;
  readonly gap: Readonly<Record<RelationType, number>>;
}

/**
 * Every marker is at most 12 px across, outline included, so a multiplicity placed the engine's
 * `endLabelAcross` off the line never meets it (GAPS #155). v12's were 12 across their centre
 * line.
 */
export const MARKER_ACROSS = 12;
/** Tip to far end of the diamonds (v12 x 1 → 18), of the dependency arrow (9 → 18), its notch. */
const DIAMOND = 17;
const ARROW = 9;
const NOTCH = 4;
/** The lollipop's diameter, and its gap: `markerOffsets` 13.5 less the 12 it spans. */
const LOLLIPOP = 12;
const LOLLIPOP_GAP = 1.5;
/** The diamonds' gap: `markerOffsets` 17.25 less their 17 (the same in v12 neo for aggregation). */
const DIAMOND_GAP = 0.25;

/** Reads the marker variables of one render's theme. */
export function markers(theme: Theme, line: Paint, hollow: Paint): Markers {
  const n = (name: string): number => Math.max(0, theme.number(name));
  return {
    line,
    hollow,
    hollowWidth: Math.min(4, n('classMarkerStrokeWidth')),
    filledWidth: Math.min(4, n('classFilledMarkerStrokeWidth')),
    length: {
      none: 0,
      aggregation: DIAMOND,
      composition: DIAMOND,
      extension: Math.min(24, n('extensionMarkerLength')),
      dependency: ARROW,
      lollipop: LOLLIPOP,
    },
    gap: {
      none: 0,
      aggregation: DIAMOND_GAP,
      composition: n('compositionMarkerGap'),
      extension: n('extensionMarkerGap'),
      dependency: n('dependencyMarkerGap'),
      lollipop: LOLLIPOP_GAP,
    },
  };
}

/**
 * How far a marker shortens the line from the node outline: to its back (or the dependency
 * arrow's notch), so the line never shows inside a hollow marker.
 */
export function markerTrim(type: RelationType, m: Markers): number {
  if (type === 'none') return 0;
  return m.gap[type] + (type === 'dependency' ? NOTCH : m.length[type]);
}

/**
 * How far from the node outline a drawn marker reaches along the line, outline (and its mitred
 * corners) included. Across it is `MARKER_ACROSS`.
 */
export function markerReach(type: RelationType, m: Markers): number {
  if (type === 'none') return 0;
  if (type === 'lollipop') return m.gap[type] + LOLLIPOP;
  const filled = type === 'composition' || type === 'dependency';
  return (
    m.gap[type] +
    (type === 'dependency' ? ARROW : m.length[type]) +
    (filled ? m.filledWidth : m.hollowWidth)
  );
}

/** Draws the marker for a line that meets the outline at `end`, travelling along (dx, dy). */
export function marker(w: SvgWriter, type: RelationType, end: LineEnd, m: Markers): void {
  if (type === 'none') return;
  const { x, y, dx, dy } = end;
  const filled = type === 'composition' || type === 'dependency';
  const sw = filled ? m.filledWidth : m.hollowWidth;
  const half = MARKER_ACROSS / 2 - sw / 2;
  // Across the line, half the marker's width.
  const ax = -dy * half;
  const ay = dx * half;
  const gap = m.gap[type];
  const back = (n: number): [number, number] => [x - dx * (gap + n), y - dy * (gap + n)];
  if (type === 'lollipop') {
    const [cx, cy] = back(LOLLIPOP / 2);
    w.leaf('circle', {
      class: 'marker lollipop',
      cx,
      cy,
      r: half,
      fill: m.hollow,
      stroke: m.line,
      'stroke-width': sw,
    });
    return;
  }
  // The tip sits half the outline back, so the outline's tip is the shape's.
  const len = m.length[type];
  const [tx, ty] = back(sw / 2);
  const b = w.path().moveTo(tx, ty);
  if (type === 'dependency') {
    const [bx, by] = back(ARROW);
    const [nx, ny] = back(NOTCH);
    b.lineTo(bx + ax, by + ay)
      .lineTo(nx, ny)
      .lineTo(bx - ax, by - ay);
  } else if (type === 'extension') {
    const [bx, by] = back(len);
    b.lineTo(bx + ax, by + ay).lineTo(bx - ax, by - ay);
  } else {
    const [mx, my] = back((len + sw / 2) / 2);
    const [fx, fy] = back(len);
    b.lineTo(mx + ax, my + ay)
      .lineTo(fx, fy)
      .lineTo(mx - ax, my - ay);
  }
  w.leaf('path', {
    class: `marker ${type}`,
    d: b.close().done(),
    fill: filled ? m.line : 'none',
    stroke: sw > 0 ? m.line : 'none',
    'stroke-width': sw > 0 ? sw : undefined,
    'stroke-linejoin': 'miter',
  });
}
