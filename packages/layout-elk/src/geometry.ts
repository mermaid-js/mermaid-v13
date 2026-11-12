/** Box geometry the engine's passes share: boxes by their top left corner and size. */
import type { Point, Side } from '@mermaid-js/core/layout';

/** A box: its top left corner and its size. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The side of `r` that `p` lies on (or is nearest to). */
export function sideOf(r: Rect, p: Point): Side {
  const d: [Side, number][] = [
    ['top', Math.abs(p.y - r.y)],
    ['bottom', Math.abs(p.y - (r.y + r.height))],
    ['left', Math.abs(p.x - r.x)],
    ['right', Math.abs(p.x - (r.x + r.width))],
  ];
  return d.reduce((best, cur) => (cur[1] < best[1] ? cur : best))[0];
}
