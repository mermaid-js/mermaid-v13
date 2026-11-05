import { beforeAll, describe, expect, it } from 'vitest';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import { tableMeasurer, type Measurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, type ThemeSpec } from '@mermaid-js/core/theme';
import type { PieModel } from '../model.ts';
import { FIXTURES, model } from './fixtures.ts';
import { layoutPie, pieLayoutViolations, type PieLayout } from './index.ts';

let spec: ThemeSpec;
beforeAll(async () => {
  spec = await loadTheme('default');
});

// A measurer with round numbers, so expected positions are worked by hand from v12's code:
// every character is 10 px wide, the ascent is 0.8 of the size and a line 1.2 of it.
const tenPx: Measurer = {
  id: 'ten',
  width: (text) => text.length * 10,
  metrics: (font) => ({
    ascent: font.size * 0.8,
    descent: font.size * 0.2,
    lineHeight: font.size * 1.2,
  }),
};

function lay(
  m: PieModel,
  pie: Record<string, unknown> = {},
  measurer: Measurer = tenPx,
  themeVariables: Record<string, unknown> = {}
): PieLayout {
  return layoutPie(m, {
    config: { pie } as unknown as ResolvedConfig,
    measurer,
    theme: createTheme(spec, { themeVariables }),
  });
}

const halves = model([
  ['A', 50],
  ['B', 50],
]);

describe('pie layout, worked from v12 pieRenderer.ts', () => {
  it('centres the pie on the 450 px canvas with radius 185 and the outer circle 1 px out', () => {
    const l = lay(halves);
    expect(l.center).toEqual({ x: 225, y: 225 });
    expect(l.radius).toBe(185);
    expect(l.innerRadius).toBe(0);
    expect(l.outerRadius).toBe(186);
    expect(l.textRadius).toBeCloseTo(138.75);
  });
});

describe('pie layout: slices', () => {
  it('splits 50/50 into two half circles clockwise from 12 o’clock, labels at 0.75 radius', () => {
    const [a, b] = lay(halves).slices;
    expect(a!.startAngle).toBe(0);
    expect(a!.endAngle).toBeCloseTo(Math.PI);
    expect(b!.startAngle).toBe(a!.endAngle);
    expect(b!.endAngle).toBeCloseTo(2 * Math.PI);
    // Midpoints at 3 and 9 o'clock, 138.75 px from the centre.
    expect(a!.anchor.x).toBeCloseTo(363.75);
    expect(a!.anchor.y).toBeCloseTo(225);
    expect(b!.anchor.x).toBeCloseTo(86.25);
    // "50%" is 30 px wide, centred on the anchor, its baseline on it (ascent 0.8 × 17).
    expect(a!.percent.text.lines[0]![0]!.text).toBe('50%');
    expect(a!.percent.x).toBeCloseTo(348.75);
    expect(a!.percent.y).toBeCloseTo(225 - 13.6);
  });

  it('keeps input order, not size order (v12 pieRenderer.spec)', () => {
    const l = lay(
      model([
        ['A', 10],
        ['B', 100],
        ['C', 50],
      ])
    );
    expect(l.slices.map((s) => s.label)).toEqual(['A', 'B', 'C']);
  });

  it('drops a slice under 1% without shifting the colours after it (v12 pieRenderer.spec)', () => {
    const l = lay(FIXTURES.hidden!);
    expect(l.slices.map((s) => [s.label, s.colour])).toEqual([
      ['A', 0],
      ['B', 1],
      ['D', 3],
    ]);
    // The shown slices fill the circle (D223): A takes 10 / 160 of it.
    expect(l.slices[0]!.endAngle).toBeCloseTo((2 * Math.PI * 10) / 160);
    expect(l.slices[2]!.endAngle).toBeCloseTo(2 * Math.PI);
    // Percentages are over the sum of all sections: 10 / 160.1 is 6%.
    expect(l.slices[0]!.percent.text.lines[0]![0]!.text).toBe('6%');
    expect(l.legend.map((r) => r.colour)).toEqual([0, 1, 2, 3]);
  });

  it('wraps colour slots after twelve sections', () => {
    expect(lay(FIXTURES.many!).legend[12]!.colour).toBe(0);
  });

  it('moves the labels with textPosition and opens a donut hole in (0, 0.9]', () => {
    expect(lay(halves, { textPosition: 0.5 }).slices[0]!.anchor.x).toBeCloseTo(225 + 92.5);
    expect(lay(halves, { donutHole: 0.4 }).innerRadius).toBeCloseTo(74);
    expect(lay(halves, { donutHole: 0.9 }).innerRadius).toBeCloseTo(166.5);
    for (const donutHole of [-0.3, 1.2, 0]) expect(lay(halves, { donutHole }).innerRadius).toBe(0);
  });

  it('highlights the named slice, and only flags hover (D222)', () => {
    expect(lay(halves, { highlightSlice: 'B' }).slices.map((s) => s.highlighted)).toEqual([
      false,
      true,
    ]);
    const hover = lay(halves, { highlightSlice: 'hover' });
    expect(hover.hover).toBe(true);
    expect(hover.slices.some((s) => s.highlighted)).toBe(false);
    const empty = lay(model([['', 1]]));
    expect(empty.slices[0]!.highlighted).toBe(false);
  });

  it('draws no slices and no NaN for no sections or a zero sum', () => {
    for (const name of ['empty', 'zero'] as const) {
      const l = lay(FIXTURES[name]!);
      expect(l.slices).toEqual([]);
      expect(l.outerRadius).toBe(186);
      expect(pieLayoutViolations(FIXTURES[name]!, l)).toEqual([]);
    }
    expect(lay(FIXTURES.zero!).legend).toHaveLength(2);
    expect(lay(FIXTURES.empty!).title?.text.lines[0]![0]!.text).toBe('Empty');
  });
});

describe('pie layout: legend and title', () => {
  // Two rows of 22 px, labels 10 px wide ("A", "B").
  it('right (the default): rows 216 px right of the centre, centred vertically', () => {
    const l = lay(halves);
    expect(l.legend.map((r) => [r.swatch.x, r.swatch.y])).toEqual([
      [441, 203],
      [441, 225],
    ]);
    expect(l.legend[0]!.swatch).toMatchObject({ width: 18, height: 18 });
    // Text at (22, 14) in the row, its baseline there.
    expect(l.legend[0]!.label.x).toBe(463);
    expect(l.legend[0]!.label.y).toBeCloseTo(203 + 14 - 13.6);
    // v12's viewBox: 450 + 40 + 22 + the longest label.
    expect(l.bounds).toEqual({ x: 0, y: 0, width: 522, height: 450 });
  });

  it('an unknown legendPosition means right', () => {
    expect(lay(halves, { legendPosition: 'nowhere' }).legend).toEqual(lay(halves).legend);
  });

  it('center: rows centred on the pie', () => {
    const l = lay(halves, { legendPosition: 'center' });
    expect(l.legend[0]!.swatch.x).toBe(225 - 5 - 22);
    expect(l.legend[0]!.swatch.y).toBe(203);
    expect(l.center).toEqual({ x: 225, y: 225 });
    expect(l.bounds).toEqual({ x: 0, y: 0, width: 490, height: 450 });
  });

  it('top: rows from the pie top, the pie moved down by the rows and one more', () => {
    const l = lay(halves, { legendPosition: 'top' });
    expect(l.legend.map((r) => r.swatch.y)).toEqual([40, 62]);
    expect(l.center).toEqual({ x: 225, y: 225 + 44 + 22 });
    expect(l.bounds.height).toBe(450 + 44);
  });

  it('bottom: rows a row under the pie', () => {
    const l = lay(halves, { legendPosition: 'bottom' });
    expect(l.legend.map((r) => r.swatch.y)).toEqual([432, 454]);
    expect(l.bounds.height).toBe(494);
  });

  it('left: rows left of the pie, which moves right; the title stays at x = 225', () => {
    const l = lay({ ...halves, title: 'Pets' }, { legendPosition: 'left' });
    expect(l.legend[0]!.swatch.x).toBe(225 - 185 - 22);
    expect(l.center).toEqual({ x: 225 + 10 + 22, y: 225 });
    expect(l.title!.x + l.title!.width / 2).toBe(225);
    expect(l.bounds.width).toBe(522);
  });

  it('the title: middle-anchored at x = 225, its baseline at y = 25, at 25 px', () => {
    const l = lay({ ...halves, title: 'Pets' });
    expect(l.title).toMatchObject({ x: 205, width: 40 });
    expect(l.title!.y).toBeCloseTo(25 - 20);
    expect(l.fonts.title.size).toBe(25);
  });

  it('showData prints the value in the legend', () => {
    const l = lay({ ...halves, showData: true });
    expect(l.legend[0]!.label.text.lines[0]![0]!.text).toBe('A [50]');
  });

  it('labels go through core label layout: <br> breaks and entities decode (D225)', () => {
    const l = lay(FIXTURES.breaks!);
    expect(l.legend[0]!.label.text.lines).toHaveLength(2);
    expect(l.legend[1]!.label.text.lines[0]!.map((r) => r.text).join('')).toBe('Tom & Jerry');
    expect(l.title!.text.lines).toHaveLength(2);
  });
});

describe('pie layout: bounds cover what is drawn (D224)', () => {
  it('grows past v12’s canvas for 30 rows', () => {
    const l = lay(FIXTURES.many!);
    // 30 rows centred on y = 225 start at 225 - 330 = -105.
    expect(l.bounds.y).toBe(-105);
    // The last row's top is 533; its label's line (20.4 px) starts 0.4 px below that.
    expect(l.bounds.y + l.bounds.height).toBeCloseTo(533 + 0.4 + 20.4);
  });

  it('grows left for a title or a centred legend wider than the canvas', () => {
    const l = lay(FIXTURES.wide!, { legendPosition: 'top' });
    const longest = l.legend[0]!.label.width;
    expect(l.bounds.x).toBe(Math.min(225 - l.title!.width / 2, 225 - longest / 2 - 22));
  });

  it('keeps v12’s viewBox where nothing overflows it', () => {
    expect(lay(halves, { legendPosition: 'center' }).bounds).toEqual(
      lay(halves, { legendPosition: 'center', highlightSlice: 'A' }).bounds
    );
  });
});

describe('pie layout: theme', () => {
  it('measures in the theme font at v12’s pie sizes until #325 adds the variables', () => {
    const l = lay(halves);
    expect(l.fonts.legend.size).toBe(17);
    expect(l.fonts.section.size).toBe(17);
    expect(l.fonts.legend.family).toBe(createTheme(spec).value('fontFamily'));
    expect(l.outerStrokeWidth).toBe(2);
  });
});

const POSITIONS = ['right', 'left', 'top', 'bottom', 'center'] as const;
describe('pie layout invariants on hand-built fixtures', () => {
  for (const legendPosition of POSITIONS)
    for (const [name, m] of Object.entries(FIXTURES))
      for (const [config, pie] of [
        ['default config', {}],
        ['every option changed', { textPosition: 0.9, donutHole: 0.5, highlightSlice: 'B' }],
      ] as const)
        it(`${name}, ${legendPosition}, ${config}`, () => {
          const l = lay(m, { ...pie, legendPosition }, tableMeasurer);
          expect(pieLayoutViolations(m, l)).toEqual([]);
        });

  it('catches a broken layout', () => {
    const m = FIXTURES.hidden!;
    const l = lay(m);
    const broken: PieLayout = {
      ...l,
      slices: l.slices.map((s, i) => (i === 2 ? { ...s, colour: 2, endAngle: 6 } : s)),
      legend: [l.legend[1]!, l.legend[0]!, ...l.legend.slice(2)],
      bounds: { ...l.bounds, width: 400 },
      center: { x: NaN, y: 225 },
    };
    expect(pieLayoutViolations(m, broken)).toEqual(
      expect.arrayContaining([
        'layout.center.x is NaN',
        'legend row 0 is section 1',
        'slice 3 has colour 2',
        expect.stringMatching(/^slices end at 6/),
        expect.stringMatching(/outside the bounds$/),
      ])
    );
  });
});
