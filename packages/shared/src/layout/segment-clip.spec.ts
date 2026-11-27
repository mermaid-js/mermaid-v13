import { describe, expect, it } from 'vitest';
import { clipSegment } from './segment-clip.ts';

const box = { x0: 0, y0: 0, x1: 10, y1: 10 };

describe('clipSegment', () => {
  it('gives the fractions where a segment enters and leaves the box', () => {
    expect(clipSegment({ x: -10, y: 5 }, { x: 40, y: 0 }, box)).toEqual([0.25, 0.5]);
  });

  it('clamps to the segment: one that starts or ends inside enters at 0 or leaves at 1', () => {
    expect(clipSegment({ x: 5, y: 5 }, { x: 20, y: 0 }, box)).toEqual([0, 0.25]);
    expect(clipSegment({ x: 2, y: 2 }, { x: 4, y: 4 }, box)).toEqual([0, 1]);
  });

  it('misses a box the segment passes beside or stops short of', () => {
    expect(clipSegment({ x: -10, y: 20 }, { x: 40, y: 0 }, box)).toBeUndefined();
    expect(clipSegment({ x: -10, y: 5 }, { x: 5, y: 0 }, box)).toBeUndefined();
    expect(clipSegment({ x: -10, y: -10 }, { x: 5, y: 30 }, box)).toBeUndefined();
  });

  it('counts a touch on the closed box as one point', () => {
    expect(clipSegment({ x: 10, y: -5 }, { x: 0, y: 20 }, box)).toEqual([0.25, 0.75]);
    expect(clipSegment({ x: 10, y: 10 }, { x: 5, y: 5 }, box)).toEqual([0, 0]);
  });
});
