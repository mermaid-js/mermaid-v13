/**
 * What an `XyChartLayout` draws, part by part: the one walk the bounds (D224) and the
 * invariants both take, so they cannot drift apart. Also the one clamp the layout uses.
 */
import { textBounds } from './text.ts';
import type { Point, Rect, Segment, XyChartLayout, XyText } from './types.ts';

/** `v` held inside `[a, b]`, either way round. */
export const clamp = (v: number, a: number, b: number): number =>
  Math.min(Math.max(v, Math.min(a, b)), Math.max(a, b));

/** A layout before its bounds are known. */
export type UnboundedLayout = Omit<XyChartLayout, 'bounds'>;

/** Called for each drawn part, with a name for it. */
export interface DrawnParts {
  /** A filled box (a bar, a legend swatch) or a text's rotated box. */
  box(r: Rect, what: string): void;
  /** A round end of a stroke `width` wide: a line's point, a segment's end. */
  dot(p: Point, width: number, what: string): void;
}

/** Visit every part `l` draws, strokes and texts by what they cover. */
export function visitDrawn(l: UnboundedLayout, parts: DrawnParts): void {
  const text = (t: XyText | undefined, what: string): void => {
    if (t) parts.box(textBounds(t), what);
  };
  const stroke = (s: Segment | undefined, width: number, what: string): void => {
    if (!s) return;
    parts.dot({ x: s.x1, y: s.y1 }, width, what);
    parts.dot({ x: s.x2, y: s.y2 }, width, what);
  };
  for (const [name, axis] of [
    ['x', l.xAxis],
    ['y', l.yAxis],
  ] as const) {
    stroke(axis.line, axis.lineWidth, `the ${name} axis line`);
    for (const t of axis.ticks) {
      stroke(t.line, axis.tickWidth, `${name} tick ${String(t.value)}`);
      text(t.label, `${name} label ${String(t.value)}`);
    }
    text(axis.title, `the ${name} axis title`);
  }
  for (const p of l.plots) {
    if (p.kind === 'bar') {
      for (const bar of p.bars) parts.box(bar, `plot ${p.index}, bar ${bar.datum}`);
      p.dataLabels.forEach((t, i) => text(t, `plot ${p.index}, data label ${i}`));
    } else {
      for (const pt of p.points) parts.dot(pt, p.strokeWidth, `plot ${p.index}, point ${pt.datum}`);
      p.pointLabels.forEach((t, i) => text(t, `plot ${p.index}, point label ${i}`));
    }
  }
  for (const r of l.legend?.rows ?? []) {
    if (r.swatch) parts.box(r.swatch, `legend row ${r.index}'s swatch`);
    stroke(r.stroke, r.strokeWidth ?? 0, `legend row ${r.index}'s stroke`);
    text(r.label, `legend row ${r.index}'s label`);
  }
  text(l.title, 'the title');
}
