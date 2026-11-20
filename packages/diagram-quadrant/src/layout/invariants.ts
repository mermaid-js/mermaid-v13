/**
 * The quadrant layout's invariants (spec #289 T3): no NaN or infinity anywhere, the four
 * quadrants tile one square, and every point centre lies inside it. Each violation is one line;
 * an empty list means the layout holds.
 */
import { near, nonFinite, within } from '@mermaid-js/shared/testing/layout-invariants';
import type { QuadrantLayout, QuadrantRect } from './types.ts';

/** Every way `layout` breaks the invariants. */
export function quadrantLayoutViolations(layout: QuadrantLayout): string[] {
  const out: string[] = [];
  nonFinite(layout, 'layout', out);
  const topLeft = layout.quadrants.find((q) => q.quadrant === 2);
  if (layout.quadrants.length !== 4 || !topLeft) {
    out.push('the layout does not have four quadrants');
    return out;
  }
  const { x, y, width: w, height: h } = topLeft;
  const expected: Record<QuadrantRect['quadrant'], readonly [number, number]> = {
    1: [x + w, y],
    2: [x, y],
    3: [x, y + h],
    4: [x + w, y + h],
  };
  for (const q of layout.quadrants) {
    const [ex, ey] = expected[q.quadrant];
    if (!(near(q.x, ex) && near(q.y, ey) && near(q.width, w) && near(q.height, h)))
      out.push(`quadrant ${q.quadrant} does not tile the square`);
  }
  const right = x + w + w;
  const bottom = y + h + h;
  for (const p of layout.points) {
    if (!within(p.cx, x, right) || !within(p.cy, y, bottom))
      out.push(`point ${p.ast} lies outside the square`);
  }
  return out;
}
