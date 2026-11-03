// The four grid directions the text kit and the diagrams' text entries share: indices into
// `DX`/`DY`, clockwise from up, so the opposite of `d` is `(d + 2) % 4`.
import type { Side } from '../layout/types.ts';

export type Dir = 0 | 1 | 2 | 3;
export const UP: Dir = 0;
export const RIGHT: Dir = 1;
export const DOWN: Dir = 2;
export const LEFT: Dir = 3;

/** Column step per direction. */
export const DX = [0, 1, 0, -1] as const;
/** Row step per direction. */
export const DY = [-1, 0, 1, 0] as const;

/** The direction from an edge's end cell into the box behind it: an end off the top points down. */
export const INTO: Readonly<Record<Side, Dir>> = {
  top: DOWN,
  right: LEFT,
  bottom: UP,
  left: RIGHT,
};

/** The direction back the way `d` goes. */
export const opposite = (d: number): Dir => ((d + 2) % 4) as Dir;
