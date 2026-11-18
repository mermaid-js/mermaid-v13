// Where a group's title goes (`LayoutGroup.titlePosition`), for the engines that honour it.

import type { LayoutGroup, Point } from './types.ts';

/** Whether the group's title sits in its bottom padding. */
export function titleLow(g: LayoutGroup): boolean {
  return g.titlePosition?.startsWith('bottom') === true;
}

/** How the title is aligned: -1 at the left, 1 at the right, 0 centred or as the engine does. */
export function titleAlign(g: LayoutGroup): -1 | 0 | 1 {
  if (g.titlePosition?.endsWith('left')) return -1;
  return g.titlePosition?.endsWith('right') ? 1 : 0;
}

/**
 * The centre of a group's title in the frame `x0…x1`, `y0…y1`: `drop` in from the border of the
 * title's side, and for a title at the left or right, `inset` in from that border.
 */
export function titlePoint(
  g: LayoutGroup,
  [x0, y0, x1, y1]: readonly [number, number, number, number],
  drop: number,
  inset: number
): Point {
  const side = titleAlign(g);
  // From the frame's middle to the title's, for a title at a side.
  const reach = (x1 - x0) / 2 - inset - (g.title?.width ?? 0) / 2;
  return { x: (x0 + x1) / 2 + side * reach, y: titleLow(g) ? y1 - drop : y0 + drop };
}
