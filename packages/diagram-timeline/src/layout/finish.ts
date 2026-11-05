import { Bounds, type Env } from './env.ts';
import type { TimelineLayout } from './types.ts';

/**
 * The layout with its bounds (D224): v12's viewBox, its `getBBox` (boxes, line ends, the
 * title) with `timeline.padding` around it, grown wherever a stroke or an arrowhead reaches
 * past it.
 */
export function finish(env: Env, layout: Omit<TimelineLayout, 'bounds'>): TimelineLayout {
  const v12 = new Bounds();
  const drawn = new Bounds();
  for (const s of layout.sections) v12.rect(s);
  for (const p of layout.periods) {
    v12.rect(p);
    for (const e of p.events) v12.rect(e);
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
