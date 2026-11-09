/**
 * Rectangle and circle helpers the layout and its invariants share: overlap, the box about a
 * circle, and everything a layout draws as boxes in the diagram frame (what `bounds` covers).
 */
import type { Circle, Rect, VennLayout } from './types.ts';

/** Whether `a` and `b` overlap by more than `eps` (touching is not overlapping). */
export const overlaps = (a: Rect, b: Rect, eps = 0): boolean =>
  a.x < b.x + b.width - eps &&
  b.x < a.x + a.width - eps &&
  a.y < b.y + b.height - eps &&
  b.y < a.y + a.height - eps;

/** The square about `c`, its radius grown by `grow`. */
export const circleBox = (c: Readonly<Circle>, grow = 0): Rect => {
  const r = c.radius + grow;
  return { x: c.x - r, y: c.y - r, width: 2 * r, height: 2 * r };
};

/** What a layout draws: everything but the bounds. */
export type LayoutDrawing = Pick<
  VennLayout,
  'width' | 'height' | 'offset' | 'areas' | 'textAreas' | 'title' | 'debug'
>;

/**
 * Every box `layout` draws, named, in the diagram frame: the canvas, the title, each circle
 * with half its stroke, each label, each text node's label, and the debug shapes with half
 * their strokes.
 */
export function* drawnBoxes(layout: LayoutDrawing): Generator<[what: string, box: Rect]> {
  const { offset } = layout;
  const moved = (r: Rect): Rect => ({ ...r, x: r.x + offset.x, y: r.y + offset.y });
  yield ['the canvas', { x: 0, y: 0, width: layout.width, height: layout.height }];
  if (layout.title) yield ['the title', layout.title];
  for (const area of layout.areas) {
    const name = area.sets.join(' ∩ ');
    const c = area.circle;
    if (c) yield [`set ${name}'s circle`, moved(circleBox(c, c.strokeWidth / 2))];
    if (area.label) yield [`${name}'s label`, moved(area.label)];
  }
  for (const t of layout.textAreas) {
    for (const n of t.nodes) yield [`text node ${n.id}'s label`, moved(n.label)];
  }
  if (layout.debug) {
    const { circleStroke, cellStroke } = layout.debug;
    for (const c of layout.debug.circles)
      yield ['a debug circle', moved(circleBox(c, circleStroke / 2))];
    for (const c of layout.debug.cells) {
      const d = cellStroke / 2;
      yield [
        'a debug cell',
        moved({ x: c.x - d, y: c.y - d, width: c.width + 2 * d, height: c.height + 2 * d }),
      ];
    }
  }
}

/** The smallest box holding every one of `boxes`. */
export function boxUnion(boxes: Iterable<Rect>): Rect {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of boxes) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.width);
    y1 = Math.max(y1, r.y + r.height);
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}
