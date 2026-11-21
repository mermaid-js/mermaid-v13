import { describe, expect, it } from 'vitest';
import { pairPlaces, stackOf } from './pairs.ts';
import type { Outline } from './shapes.ts';

/**
 * Where repeated lines between two shapes run (#680) and how their tags stand (D679), on
 * `pairPlaces` itself: two boxes side by side, the room their sides share set by their height.
 */
const box = (x: number, height: number): Outline => ({
  x,
  y: 0,
  width: 100,
  height,
  form: 'rounded',
});
/** A one-line tag's step: its height and a gap either side. */
const STEP = 20;
/** Sides 100 high: room for five lines a step apart (`portInset` 8 in from each end). */
const TALL = 100;
/** Sides 60 high: two steps of room, so five lines are half a step apart. */
const SHORT = 60;
/** Sides 30 high: less than half a step for five lines. */
const FLAT = 30;
const lines = (height: number, count: number, from: (k: number) => 'a' | 'b' = () => 'a') => {
  const [a, b] = [box(0, height), box(300, height)];
  return pairPlaces(
    Array.from({ length: count }, (_, k) =>
      from(k) === 'a' ? { a, b, tagStep: STEP } : { a: b, b: a, tagStep: STEP }
    )
  );
};

describe('pairPlaces tags (D679)', () => {
  it('spaces lines a step apart where the room holds them, each tag on its line', () => {
    for (const p of lines(TALL, 5)) expect(p).toMatchObject({ tagged: true, spaced: true });
    expect(lines(TALL, 5).some((p) => p.stagger)).toBe(false);
  });

  it('staggers the tags where the room holds half a step, alternately at either shape', () => {
    expect(lines(SHORT, 5).map((p) => p.stagger)).toEqual([
      'start',
      'end',
      'start',
      'end',
      'start',
    ]);
    // A line drawn from the other shape keeps to the same shape, its own end.
    expect(lines(SHORT, 5, (k) => (k === 1 ? 'b' : 'a')).map((p) => p.stagger)).toEqual([
      'start',
      'start',
      'start',
      'end',
      'start',
    ]);
  });

  it('squeezes the lines closer than half a step: tagged, not spaced', () => {
    for (const p of lines(FLAT, 5)) {
      expect(p.tagged).toBe(true);
      expect(p.spaced).toBeUndefined();
    }
  });

  it('carries no tag flags without tags', () => {
    const [a, b] = [box(0, TALL), box(300, TALL)];
    for (const p of pairPlaces([
      { a, b },
      { a, b },
    ]))
      expect(p).toEqual({ shift: p.shift });
  });
});

describe('stackOf (D679)', () => {
  it('is a column where the lines fit a step apart, staggered at half a step, else squeezed', () => {
    // Four steps over two rooms (either side of the middle) of 40: just a column.
    expect(stackOf(5, 40, STEP)).toBe('column');
    expect(stackOf(5, 39, STEP)).toBe('stagger');
    expect(stackOf(5, 20, STEP)).toBe('stagger');
    expect(stackOf(5, 19, STEP)).toBe('squeezed');
    expect(stackOf(1, 0, STEP)).toBe('column');
  });
});
