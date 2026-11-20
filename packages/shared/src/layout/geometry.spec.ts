import { describe, expect, it } from 'vitest';
import { discBox, extraLines } from './geometry.ts';

describe('discBox', () => {
  it('is the square around the disc', () => {
    expect(discBox({ x: 10, y: 20 }, 5)).toEqual({ x: 5, y: 15, width: 10, height: 10 });
  });

  it('is a point for a zero radius', () => {
    expect(discBox({ x: 3, y: -4 }, 0)).toEqual({ x: 3, y: -4, width: 0, height: 0 });
  });
});

describe('extraLines', () => {
  it('is 0 for one line', () => {
    expect(extraLines({ height: 19, lineHeight: 19 })).toBe(0);
  });

  it('is what the lines after the first add', () => {
    expect(extraLines({ height: 57, lineHeight: 19 })).toBe(38);
  });

  it('is never negative (an empty label is shorter than a line)', () => {
    expect(extraLines({ height: 0, lineHeight: 19 })).toBe(0);
  });
});
