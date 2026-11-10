/**
 * Inline arrowheads (no `<marker>`, DESIGN §7.1): a local copy of flowchart's
 * (`diagram-flowchart/src/render/edges.ts`, `arrowheads`, `markerTrim`, `marker`), which is
 * ported from Pele's src/svg/edges.ts at 3a2f075 (https://github.com/obsidianmd/pele, MIT,
 * (c) 2026 kepano). Their geometry is the theme's arrowhead rows (D152), shared with flowchart.
 */
// cspell:ignore kepano
import type { Attrs, SvgWriter } from '@mermaid-js/core/svg';
import type { Theme } from '@mermaid-js/core/theme';
import type { BlockArrowType } from '../model.ts';

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
  trim(geometry: Arrowheads): number;
  /** Draws the head for a line meeting the outline at (x, y), travelling along (dx, dy). */
  draw(w: SvgWriter, tip: LineEnd, paint: Attrs, geometry: Arrowheads): void;
}

/** The open link and none draw no head. */
const NONE: HeadKind = {
  trim: () => 0,
  draw: () => {
    // No head to draw.
  },
};

/** Each v12 arrow type's head: every `BlockArrowType` has one, so a new type is a type error. */
const HEADS: Readonly<Record<BlockArrowType, HeadKind>> = {
  arrow_point: {
    trim: (geometry) => geometry.gap + Math.max(0, geometry.length - 1),
    draw(w, { x, y, dx, dy }, paint, geometry) {
      const tipX = x - dx * geometry.gap;
      const tipY = y - dy * geometry.gap;
      const baseX = tipX - dx * geometry.length;
      const baseY = tipY - dy * geometry.length;
      const acrossX = -dy * (geometry.width / 2);
      const acrossY = dx * (geometry.width / 2);
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
  arrow_circle: {
    trim: (geometry) => geometry.circleGap + geometry.circleSize / 2,
    draw(w, { x, y, dx, dy }, paint, geometry) {
      const r = geometry.circleSize / 2;
      const back = geometry.circleGap + r;
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
  arrow_cross: {
    trim: (geometry) => geometry.crossGap + geometry.crossSize / 2,
    // The arms are the diagonals of a square of side `crossSize`, `crossGap` from the outline.
    draw(w, { x, y, dx, dy }, paint, geometry) {
      const half = geometry.crossSize / 2;
      const cx = x - dx * (geometry.crossGap + half);
      const cy = y - dy * (geometry.crossGap + half);
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
        'stroke-width': geometry.crossStrokeWidth,
      });
    },
  },
  arrow_open: NONE,
  '': NONE,
};

/** How far an end marker of this v12 type shortens the line from the outline. */
export const markerTrim = (type: BlockArrowType, geometry: Arrowheads): number =>
  HEADS[type].trim(geometry);

/** Draws a v12 end marker (`arrow_open` and none draw nothing); `paint.fill` is its colour. */
export function marker(
  w: SvgWriter,
  type: BlockArrowType,
  end: LineEnd,
  paint: Attrs,
  geometry: Arrowheads
): void {
  HEADS[type].draw(w, end, paint, geometry);
}
