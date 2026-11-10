/**
 * What a journey layout draws, as rectangles: the one list the layout's bounds and the
 * invariants' containment check both read.
 */
import type { Circle, JourneyLayout, Rect } from './types.ts';
import type { JourneyMetrics } from './metrics.ts';
import { unionRects } from '@mermaid-js/core/layout';

const circle = (c: Circle, stroke: number): Rect => {
  const r = c.r + stroke / 2;
  return { x: c.cx - r, y: c.cy - r, width: 2 * r, height: 2 * r };
};

/** Every drawn part's box, strokes included where the metrics give their width. */
export function drawnRects(
  m: JourneyMetrics,
  layout: Omit<JourneyLayout, 'bounds' | 'units'>
): Rect[] {
  const out: Rect[] = [];
  if (layout.title) out.push(layout.title);
  for (const e of layout.legend) out.push(circle(e.dot, m.dotStroke), e.label);
  for (const b of layout.bands) {
    out.push(b);
    if (b.label) out.push(b.label);
  }
  for (const t of layout.tasks) {
    out.push(t);
    if (t.label) out.push(t.label);
    const half = m.taskLineStroke / 2;
    out.push({ x: t.line.x - half, y: t.line.y1, width: 2 * half, height: t.line.y2 - t.line.y1 });
    out.push(circle(t.face, m.faceStroke));
    for (const d of t.dots) out.push(circle(d, m.dotStroke));
  }
  const a = layout.activity;
  const tip = a.x2 + m.headReach * a.strokeWidth;
  const half = Math.max(a.strokeWidth / 2, m.headHalf * a.strokeWidth);
  out.push({ x: a.x1, y: a.y - half, width: tip - a.x1, height: 2 * half });
  return out;
}

export { unionRects as union };
