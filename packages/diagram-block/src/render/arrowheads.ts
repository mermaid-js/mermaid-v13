/**
 * Inline arrowheads (no `<marker>`, DESIGN §7.1): a local copy of flowchart's
 * (`diagram-flowchart/src/render/edges.ts`, `arrowheads`, `markerTrim`, `marker`), which is
 * ported from Pele's src/svg/edges.ts at 3a2f075 (https://github.com/obsidianmd/pele, MIT,
 * (c) 2026 kepano). Their geometry is the theme's arrowhead rows (D152), shared with flowchart.
 */
// cspell:ignore kepano
import type { Attrs, SvgWriter } from '@mermaid-js/core/svg';
import type { Theme } from '@mermaid-js/core/theme';

/** Arrowhead geometry for one render. A gap is the space between the outline and the head. */
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

/** Where a line meets an outline, and the unit direction it travels there. */
export interface LineEnd {
  readonly x: number;
  readonly y: number;
  readonly dx: number;
  readonly dy: number;
}

/** One v12 arrowhead type: how far it shortens the line, and how it is drawn. */
interface HeadKind {
  /** How far the line stops short of the outline: past the gap and under the head. */
  trim(g: Arrowheads): number;
  /** Draws the head for a line meeting the outline at (x, y), travelling along (dx, dy). */
  draw(w: SvgWriter, tip: LineEnd, paint: Attrs, g: Arrowheads): void;
}

const HEADS: ReadonlyMap<string, HeadKind> = /* @__PURE__ */ new Map<string, HeadKind>([
  [
    'arrow_point',
    {
      trim: (g) => g.gap + Math.max(0, g.length - 1),
      draw(w, { x, y, dx, dy }, paint, g) {
        const tipX = x - dx * g.gap;
        const tipY = y - dy * g.gap;
        const baseX = tipX - dx * g.length;
        const baseY = tipY - dy * g.length;
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
      },
    },
  ],
  [
    'arrow_circle',
    {
      trim: (g) => g.circleGap + g.circleSize / 2,
      draw(w, { x, y, dx, dy }, paint, g) {
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
      },
    },
  ],
  [
    'arrow_cross',
    {
      trim: (g) => g.crossGap + g.crossSize / 2,
      // The arms are the diagonals of a square of side `crossSize`, `crossGap` from the outline.
      draw(w, { x, y, dx, dy }, paint, g) {
        const half = g.crossSize / 2;
        const cx = x - dx * (g.crossGap + half);
        const cy = y - dy * (g.crossGap + half);
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
        w.leaf('path', {
          class: 'marker',
          d,
          stroke: paint.fill,
          'stroke-width': g.crossStrokeWidth,
        });
      },
    },
  ],
]);

/** How far an end marker of this v12 type shortens the line from the outline. */
export const markerTrim = (type: string, geometry: Arrowheads): number =>
  HEADS.get(type)?.trim(geometry) ?? 0;

/** Draws a v12 end marker (`arrow_open` and none draw nothing); `paint.fill` is its colour. */
export function marker(
  w: SvgWriter,
  type: string,
  end: LineEnd,
  paint: Attrs,
  geometry: Arrowheads
): void {
  HEADS.get(type)?.draw(w, end, paint, geometry);
}
