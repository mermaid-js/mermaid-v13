import { Bounds, type Env } from './env.ts';
import type { Rect, TimelineLayout } from './types.ts';

/**
 * The layout with its bounds (D224): v12's viewBox, its `getBBox` (boxes, line ends, the
 * title) with `timeline.padding` around it, grown wherever a stroke or an arrowhead reaches
 * past it: half of each box's outline, and half of the rule under it. A drop shadow is left
 * out, as flowchart leaves it out of its bounds.
 */
export function finish(env: Env, layout: Omit<TimelineLayout, 'bounds'>): TimelineLayout {
  const v12 = new Bounds();
  const drawn = new Bounds();
  const { outline, rule } = env.strokes;
  const box = (r: Rect): void => {
    v12.rect(r);
    const o = outline / 2;
    drawn.rect({ x: r.x - o, y: r.y - o, width: r.width + outline, height: r.height + outline });
    drawn.point(r.x, r.y + r.height + rule / 2);
  };
  for (const s of layout.sections) box(s);
  for (const p of layout.periods) {
    box(p);
    for (const e of p.events) box(e);
  }
  for (const c of [...layout.connectors, layout.axis]) {
    v12.segment(c);
    drawn.stroke(c);
  }
  if (layout.title) v12.rect(layout.title);
  const inner = v12.box({ x: 0, y: 0 });
  const pad = env.padding;
  drawn.rect({
    x: inner.x - pad,
    y: inner.y - pad,
    width: inner.width + 2 * pad,
    height: inner.height + 2 * pad,
  });
  return { ...layout, bounds: drawn.box({ x: 0, y: 0 }) };
}
