import { describe, expect, it } from 'vitest';
import { blockedStretches, headerCentre } from './headers.ts';
import { C4_BETA_METRICS as B } from './metrics.ts';

describe('where a boundary header sits', () => {
  const span = [0, 400] as const;

  it('stays where it is preferred when nothing is in its way', () => {
    expect(headerCentre(span, 100, [], 200)).toBe(200);
  });

  it('slides to the nearest clear stretch wide enough for it', () => {
    // Blocked 150..250 around the middle: the clear stretches are 0..150 and 250..400.
    expect(headerCentre(span, 100, [[150, 250]], 180)).toBe(100);
    expect(headerCentre(span, 100, [[150, 250]], 230)).toBe(300);
  });

  it('keeps its whole width inside the stretch it takes', () => {
    expect(headerCentre(span, 100, [[0, 20]], 10)).toBe(70);
    expect(headerCentre(span, 100, [[380, 400]], 390)).toBe(330);
  });

  it('skips a stretch too narrow for it, and returns the preferred centre when none is wide enough', () => {
    expect(
      headerCentre(
        span,
        100,
        [
          [50, 100],
          [160, 400],
        ],
        75
      )
    ).toBe(75);
    expect(headerCentre(span, 380, [[190, 210]], 120)).toBe(120);
  });

  it('merges blocked stretches that overlap, in any order', () => {
    expect(
      headerCentre(
        span,
        100,
        [
          [200, 300],
          [100, 250],
        ],
        150
      )
    ).toBe(50);
  });
});

describe('what a header keeps clear of', () => {
  const band = [100, 120] as const;
  const clear = (x: readonly [number, number]): [number, number] => [
    x[0] - B.headClear,
    x[1] + B.headClear,
  ];

  it('is a vertical line through the band, a level one in it, and a slanting one where it crosses', () => {
    expect(
      blockedStretches(
        [
          [
            { x: 50, y: 0 },
            { x: 50, y: 300 },
          ],
        ],
        [],
        band
      )
    ).toEqual([clear([50, 50])]);
    expect(
      blockedStretches(
        [
          [
            { x: 10, y: 110 },
            { x: 90, y: 110 },
          ],
        ],
        [],
        band
      )
    ).toEqual([clear([10, 90])]);
    expect(
      blockedStretches(
        [
          [
            { x: 0, y: 0 },
            { x: 200, y: 200 },
          ],
        ],
        [],
        band
      )
    ).toEqual([clear([100, 120])]);
  });

  it('ignores a line that stays above or below the band', () => {
    expect(
      blockedStretches(
        [
          [
            { x: 5, y: 0 },
            { x: 5, y: 50 },
          ],
          [
            { x: 5, y: 150 },
            { x: 80, y: 150 },
          ],
        ],
        [],
        band
      )
    ).toEqual([]);
  });

  it('is a box that reaches into the band', () => {
    expect(blockedStretches([], [{ x: 30, y: 110, width: 40, height: 30 }], band)).toEqual([
      clear([30, 70]),
    ]);
    expect(blockedStretches([], [{ x: 30, y: 121, width: 40, height: 30 }], band)).toEqual([]);
  });
});
