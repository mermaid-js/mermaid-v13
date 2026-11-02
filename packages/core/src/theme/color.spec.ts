import { describe, expect, it } from 'vitest';
import { contrastRatio, formatColor, invertColor, mixColors, parseColor } from './index.ts';

describe('colour maths (no khroma)', () => {
  it('parses hex, named, rgb() and hsl() colours', () => {
    expect(parseColor('#ECECFF')).toEqual([236, 236, 255, 1]);
    expect(parseColor('#abc')).toEqual([170, 187, 204, 1]);
    expect(parseColor('#00000080')).toEqual([0, 0, 0, 128 / 255]);
    expect(parseColor('lightgrey')).toEqual([211, 211, 211, 1]);
    expect(parseColor('LightGray')).toEqual([211, 211, 211, 1]);
    expect(parseColor('cyan')).toEqual([0, 255, 255, 1]);
    expect(parseColor('transparent')).toEqual([0, 0, 0, 0]);
    expect(parseColor('rgb(255, 0, 0)')).toEqual([255, 0, 0, 1]);
    expect(parseColor('rgba(232,232,232, 0.8)')).toEqual([232, 232, 232, 0.8]);
    expect(parseColor('rgb(100% 50% 0% / 50%)')).toEqual([255, 127.5, 0, 0.5]);
    expect(parseColor('hsl(0, 0%, 80%)')).toEqual([204, 204, 204, 1]);
    expect(parseColor('hsl(120deg 100% 25%)')).toEqual([0, 127.5, 0, 1]);
  });

  it('leaves colours it cannot compute to CSS', () => {
    for (const c of ['oklch(70% 0.1 200)', 'var(--mermaid-x)', 'notacolor', '#12', 'rgb(1,2)'])
      expect(parseColor(c)).toBeUndefined();
  });

  it('mixes like color-mix(in srgb) with premultiplied alpha', () => {
    // color-mix(in srgb, white 50%, black) = rgb(127.5 127.5 127.5)
    expect(mixColors([255, 255, 255, 1], [0, 0, 0, 1], 0.5)).toEqual([127.5, 127.5, 127.5, 1]);
    // color-mix(in srgb, red 25%, transparent): colour stays red, alpha 0.25
    expect(mixColors([255, 0, 0, 1], [0, 0, 0, 0], 0.25)).toEqual([255, 0, 0, 0.25]);
    expect(formatColor([127.5, 127.5, 127.5, 1])).toBe('#808080');
    expect(formatColor([255, 0, 0, 0.25])).toBe('#ff000040');
    expect(invertColor([255, 0, 16, 1])).toEqual([0, 255, 239, 1]);
  });

  it('computes WCAG 2 contrast ratios', () => {
    expect(contrastRatio([0, 0, 0, 1], [255, 255, 255, 1])).toBeCloseTo(21, 5);
    expect(contrastRatio([255, 255, 255, 1], [255, 255, 255, 1])).toBeCloseTo(1, 5);
    // WebAIM checker: #777777 on white is 4.48
    expect(contrastRatio([119, 119, 119, 1], [255, 255, 255, 1])).toBeCloseTo(4.48, 2);
  });
});
