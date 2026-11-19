import { describe, expect, it } from 'vitest';
import { tableMeasurer } from '@mermaid-js/core/text';
import { placeTitle, titledViewBox, type TitleContext } from './document.ts';

type Box = readonly [number, number, number, number];
/** The `[x, y, width, height]` form, which a titled viewBox always has. */
const tuple = (v: ReturnType<typeof titledViewBox>): Box => {
  if (!Array.isArray(v)) throw new Error('expected [x, y, width, height]');
  return v as Box;
};

const ctx: TitleContext = {
  theme: { value: () => 'Arial' },
  measurer: tableMeasurer,
};

describe('placeTitle (D652)', () => {
  it('places nothing for a missing or blank title', () => {
    expect(placeTitle(undefined, 100, 25, ctx, 16)).toBeUndefined();
    expect(placeTitle('  ', 100, 25, ctx, 16)).toBeUndefined();
  });

  it('centres the title over the drawing, its baseline topMargin above the top', () => {
    const t = placeTitle(' Title ', 100, 25, ctx, 18)!;
    expect(t.label.lines.flat().map((r) => r.text)).toEqual(['Title']);
    expect(t.x).toBe(50);
    // The label's centre, less its baseline offset, is the baseline: at -25.
    expect(t.y - t.label.height / 2 + t.label.baseline).toBeCloseTo(-25, 9);
  });
});

describe('titledViewBox (D652)', () => {
  it('is the box itself without a title', () => {
    expect(titledViewBox({ width: 10.5, height: 20 }, undefined, 8)).toEqual({
      width: 10.5,
      height: 20,
    });
  });

  it('grows up and to both sides to hold the title with the padding, in whole pixels', () => {
    const t = placeTitle('A title wider than its drawing', 40, 25, ctx, 16)!;
    const [x, y, width, height] = tuple(titledViewBox({ width: 40, height: 30.2 }, t, 8));
    expect(x).toBe(Math.floor(20 - t.label.width / 2 - 8));
    expect(y).toBe(Math.floor(t.y - t.label.height / 2 - 8));
    expect(x + width).toBe(Math.ceil(20 + t.label.width / 2 + 8));
    expect(y + height).toBe(31);
  });

  it('keeps the drawing width when the title is narrower', () => {
    const t = placeTitle('T', 300, 25, ctx, 16)!;
    const [x, , width] = tuple(titledViewBox({ width: 300, height: 30 }, t, 8));
    expect([x, width]).toEqual([0, 300]);
  });
});
