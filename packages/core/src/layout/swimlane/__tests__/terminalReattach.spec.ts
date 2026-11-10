// Route ends brought back onto their boxes (v13, `terminalReattach.ts`).
import { describe, expect, it } from 'vitest';
import type { Point } from '../../types.ts';
import { reattachTerminals } from '../terminalReattach.ts';
import { internalData } from './internalData.ts';

/** A at 0–40 × 0–20, B far to the right; the route given for A to B. */
function routeFrom(points: Point[]): Point[] {
  const data = internalData(
    [
      { id: 'A', x: 20, y: 10, width: 40, height: 20 },
      { id: 'B', x: 320, y: 10, width: 40, height: 20 },
    ],
    [{ start: 'A', end: 'B', points: [...points, { x: 300, y: 10 }] }]
  );
  reattachTerminals(data);
  return data.edges[0]!.points!.slice(0, -1);
}

describe('reattachTerminals', () => {
  it('slides an end along a leg that runs away from the box onto its side', () => {
    expect(
      routeFrom([
        { x: 20, y: -20 },
        { x: 20, y: -40 },
        { x: 300, y: -40 },
      ])
    ).toEqual([
      { x: 20, y: 0 },
      { x: 20, y: -40 },
      { x: 300, y: -40 },
    ]);
  });

  it('joins with a stub, not a slide, when the leg runs back towards the box', () => {
    expect(
      routeFrom([
        { x: 20, y: -20 },
        { x: 20, y: 5 },
        { x: 300, y: 5 },
      ])
    ).toEqual([
      { x: 20, y: 0 },
      { x: 20, y: -20 },
      { x: 20, y: 5 },
      { x: 300, y: 5 },
    ]);
  });

  it('joins an end past a corner with two legs, off the corner', () => {
    expect(
      routeFrom([
        { x: 60, y: -20 },
        { x: 300, y: -20 },
      ])
    ).toEqual([
      { x: 36, y: 0 },
      { x: 36, y: -20 },
      { x: 60, y: -20 },
      { x: 300, y: -20 },
    ]);
  });

  it('leaves an end on its box alone', () => {
    expect(routeFrom([{ x: 40, y: 10 }])).toEqual([{ x: 40, y: 10 }]);
  });
});
