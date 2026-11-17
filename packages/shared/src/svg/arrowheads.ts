// Inline end markers (no <defs>/<marker>, DESIGN §7.1): v12's point, circle and cross heads.
// Ported from Pele's src/svg/edges.ts @ 3a2f075 (https://github.com/obsidianmd/pele, MIT,
// (c) 2026 kepano): `marker`, `markerTrim`. The fill-aware casings are left out.
// cspell:ignore kepano
import type { Theme } from '@mermaid-js/core/theme';
import type { Attrs, SvgWriter } from '@mermaid-js/core/svg';

/**
 * Arrowhead geometry for one render, from the theme (D152). A gap is the space between the
 * node outline and the nearest point of the arrowhead.
 */
export interface Arrowheads {
  readonly gap: number;
  readonly length: number;
  readonly width: number;
  readonly circleSize: number;
  readonly circleGap: number;
  readonly crossSize: number;
  readonly crossGap: number;
  readonly crossStrokeWidth: number;
}

/** Reads the arrowhead variables as numbers (they never become CSS variables). */
export function arrowheads(theme: Theme): Arrowheads {
  return {
    gap: theme.number('arrowheadGap'),
    length: theme.number('arrowheadLength'),
    width: theme.number('arrowheadWidth'),
    circleSize: theme.number('circleArrowheadSize'),
    circleGap: theme.number('circleArrowheadGap'),
    crossSize: theme.number('crossArrowheadSize'),
    crossGap: theme.number('crossArrowheadGap'),
    crossStrokeWidth: theme.number('crossArrowheadStrokeWidth'),
  };
}

/** How far an edge runs straight before a marker at its end, where it has the room. */
export const LEAD = 6;

/** Where a line meets a node outline, and the unit direction it travels there. */
export interface LineEnd {
  readonly x: number;
  readonly y: number;
  readonly dx: number;
  readonly dy: number;
}

/**
 * How far an end marker of this v12 type (`arrow_point`, `arrow_circle`, `arrow_cross`; any
 * other has no head) shortens the line from the node outline: past the gap and under the
 * arrowhead, so the line never shows between the tip and the node.
 */
export function markerTrim(type: string, g: Arrowheads): number {
  if (type === 'arrow_point') return g.gap + Math.max(0, g.length - 1);
  if (type === 'arrow_circle') return g.circleGap + g.circleSize / 2;
  if (type === 'arrow_cross') return g.crossGap + g.crossSize / 2;
  return 0;
}

/**
 * Draws a v12 end marker for a line that meets the node outline at `end` (x, y), pointing
 * along (dx, dy). The marker sits its gap before the outline; `paint` gives its colour as
 * `fill`. With `fade`, the stroked cross head also takes the paint's `opacity`, and its
 * `fill-opacity` as `stroke-opacity`.
 */
export function marker(
  w: SvgWriter,
  type: string,
  { x, y, dx, dy }: LineEnd,
  paint: Attrs,
  g: Arrowheads,
  fade = false
): void {
  if (type === 'arrow_point') {
    const tipX = x - dx * g.gap;
    const tipY = y - dy * g.gap;
    const baseX = tipX - dx * g.length;
    const baseY = tipY - dy * g.length;
    // Half the base, across the line.
    const acrossX = -dy * (g.width / 2);
    const acrossY = dx * (g.width / 2);
    const d = w
      .path()
      .moveTo(tipX, tipY)
      .lineTo(baseX + acrossX, baseY + acrossY)
      .lineTo(baseX - acrossX, baseY - acrossY)
      .close()
      .done();
    w.leaf('path', { class: 'marker', d, ...paint, stroke: 'none' });
  } else if (type === 'arrow_circle') {
    const r = g.circleSize / 2;
    const back = g.circleGap + r;
    w.leaf('circle', {
      class: 'marker',
      cx: x - dx * back,
      cy: y - dy * back,
      r,
      ...paint,
      stroke: 'none',
    });
  } else if (type === 'arrow_cross') {
    // The arms are the diagonals of a square of side `crossSize`, `crossGap` from the outline.
    const half = g.crossSize / 2;
    const cx = x - dx * (g.crossGap + half);
    const cy = y - dy * (g.crossGap + half);
    // Half of each diagonal: along the line plus or minus across it.
    const ux = (dx - dy) * half;
    const uy = (dy + dx) * half;
    const vx = (dx + dy) * half;
    const vy = (dy - dx) * half;
    const d = w
      .path()
      .moveTo(cx - ux, cy - uy)
      .lineTo(cx + ux, cy + uy)
      .moveTo(cx - vx, cy - vy)
      .lineTo(cx + vx, cy + vy)
      .done();
    w.leaf(
      'path',
      fade
        ? {
            class: 'marker',
            d,
            stroke: paint.fill,
            'stroke-width': g.crossStrokeWidth,
            opacity: paint.opacity,
            'stroke-opacity': paint['fill-opacity'],
          }
        : { class: 'marker', d, stroke: paint.fill, 'stroke-width': g.crossStrokeWidth }
    );
  }
}
