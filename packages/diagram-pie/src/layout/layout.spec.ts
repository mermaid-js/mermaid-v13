import type { DiagramPlugin } from '@mermaid-js/core';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import { tableMeasurer, type Measurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, type ThemeSpec } from '@mermaid-js/core/theme';
import type { PieModel } from '../model.ts';
import { FIXTURES, model } from './fixtures.ts';
import { layoutPie, type PieLayout } from './index.ts';
import { pieLayoutViolations } from './invariants.ts';
import { pie as diagramPlugin } from '../plugin.ts';

/** The diagram's own theme table (D331), passed to `createTheme` as the pipeline does. */
const { theme: diagramTheme }: Pick<DiagramPlugin, 'id' | 'theme'> = diagramPlugin;

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
    theme: createTheme(spec, { diagram: diagramTheme, themeVariables }),
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

  it('shares two values whose sum is past a double, the same as for small ones (D226)', () => {
    const big = lay(
      model([
        ['A', 1e308],
        ['B', 1e308],
      ]),
      {},
      tableMeasurer
    );
    const small = lay(
      model([
        ['A', 1],
        ['B', 1],
      ]),
      {},
      tableMeasurer
    );
    expect(big.slices.map((s) => [s.startAngle, s.endAngle])).toEqual(
      small.slices.map((s) => [s.startAngle, s.endAngle])
    );
    expect(big.slices.map((s) => s.percent.text.lines[0]![0]!.text)).toEqual(['50%', '50%']);
    expect(
      pieLayoutViolations(
        model([
          ['A', 1e308],
          ['B', 1e308],
        ]),
        big
      )
    ).toEqual([]);
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

describe('pie layout: labels of several lines and markdown strings (D225)', () => {
  // tenPx: a legend line is 20.4 px (17 px text), a title line 30 px (25 px) with its
  // baseline 20 px down.
  it('a legend row takes its label’s height; rows of one line keep v12’s 22 px', () => {
    const l = lay(
      model([
        ['One<br>two<br>three', 1],
        ['B', 1],
        ['C', 1],
      ])
    );
    const ys = l.legend.map((r) => r.swatch.y);
    expect(ys[1]! - ys[0]!).toBeCloseTo(22 + 2 * 20.4);
    expect(ys[2]! - ys[1]!).toBe(22);
    // Still centred on the pie: 3 rows of 22 px and two extra lines.
    expect(ys[0]).toBeCloseTo(225 - (3 * 22 + 2 * 20.4) / 2);
    expect(l.legend[0]!.label.y + l.legend[0]!.label.height).toBeLessThanOrEqual(
      l.legend[1]!.label.y
    );
  });

  it('a title of several lines grows up from v12’s baseline, clear of the pie', () => {
    const l = lay({ ...halves, title: 'L1<br>L2<br>L3' });
    // The last line's baseline at y = 25, where v12 drew its one line.
    expect(l.title!.y + 2 * 30 + 20).toBeCloseTo(25);
    expect(l.title!.y + l.title!.height).toBeLessThanOrEqual(l.center.y - l.outerRadius - 1);
    expect(l.bounds.y).toBeCloseTo(l.title!.y);
    expect(l.center).toEqual(lay(halves).center);
  });

  it('keeps one-line labels where they were', () => {
    const one = lay({ ...halves, title: 'Pets' }, { legendPosition: 'top' });
    expect(one.title!.y).toBeCloseTo(5);
    expect(one.legend.map((r) => r.swatch.y)).toEqual([40, 62]);
  });

  it('lays out a markdown string as markdown in the legend and the title', () => {
    const l = lay(
      model(
        [
          ['`**md** x`', 1],
          ['B', 1],
        ],
        { showData: true, title: '"`*T* y`"' }
      )
    );
    const runs = (r: { text: { lines: { text: string; style: number }[][] } }) =>
      r.text.lines[0]!.map((x) => [x.text, x.style]);
    const [bold, plain] = runs(l.legend[0]!.label);
    expect(bold![0]).toBe('md');
    expect(bold![1]).not.toBe(0);
    expect(
      runs(l.legend[0]!.label)
        .map(([t]) => t)
        .join('')
    ).toBe('md x [1]');
    expect(plain![1]).toBe(0);
    expect(
      runs(l.title!)
        .map(([t]) => t)
        .join('')
    ).toBe('T y');
    expect(runs(l.title!)[0]![1]).not.toBe(0);
    // Not a markdown string: kept as written.
    expect(runs(lay(model([['**md**', 1]])).legend[0]!.label)).toEqual([['**md**', 0]]);
  });

  it('the invariants catch overlapping labels', () => {
    const l = lay({ ...FIXTURES.breaks!, title: 'Pets' });
    const row = l.legend[1]!;
    const broken: PieLayout = {
      ...l,
      legend: [l.legend[0]!, { ...row, label: { ...row.label, y: l.legend[0]!.label.y } }],
      title: { ...l.title!, y: l.center.y - l.radius },
    };
    expect(pieLayoutViolations(FIXTURES.breaks!, broken)).toEqual(
      expect.arrayContaining([
        "legend row 0's label overlaps legend row 1's label",
        'the title overlaps the pie',
      ])
    );
  });
});

describe('pie layout: a legend taller than the canvas breaks into columns (D616)', () => {
  // `many` has 30 rows of 22 px, labels "Section 1" … "Section 30", the longest 100 px wide.
  // A column holds 20 rows (440 px of the 450 px canvas); columns are a label and a row apart:
  // 22 + 100 + 22 = 144 px.
  const columnsOf = (l: PieLayout): number[] => [...new Set(l.legend.map((r) => r.swatch.x))];

  it('right: 20 rows a column, centred on the canvas, the viewBox widened for the columns', () => {
    const l = lay(FIXTURES.many!);
    expect(columnsOf(l)).toEqual([441, 441 + 144]);
    expect(l.legend.slice(0, 20).every((r) => r.swatch.x === 441)).toBe(true);
    // The tallest column (440 px) is centred on y = 225; the second starts at the same top.
    expect(l.legend[0]!.swatch.y).toBe(5);
    expect(l.legend[19]!.swatch.y).toBe(5 + 19 * 22);
    expect(l.legend[20]!.swatch.y).toBe(5);
    expect(l.legend[29]!.swatch.y).toBe(5 + 9 * 22);
    expect(l.center).toEqual({ x: 225, y: 225 });
    // v12's canvas height; 450 + 40, a column of 144, then the last column's swatch and label.
    expect(l.bounds).toEqual({ x: 0, y: 0, width: 490 + 144 + 22 + 100, height: 450 });
  });

  it('left: the pie moves right by every column, and the title centres on the pie', () => {
    const l = lay({ ...FIXTURES.many!, title: 'Pets' }, { legendPosition: 'left' });
    expect(columnsOf(l)).toEqual([18, 18 + 144]);
    expect(l.center).toEqual({ x: 225 + 144 + 100 + 22, y: 225 });
    expect(l.title!.x + l.title!.width / 2).toBe(l.center.x);
    expect(l.bounds.width).toBe(490 + 144 + 22 + 100);
    expect(pieLayoutViolations(FIXTURES.many!, l)).toEqual([]);
  });

  it('top: columns of 440 px from the pie top, the pie moved down by one column', () => {
    const l = lay(FIXTURES.many!, { legendPosition: 'top' });
    expect(columnsOf(l)).toEqual([225 - (144 + 100) / 2 - 22, 225 - (144 + 100) / 2 - 22 + 144]);
    expect(l.legend[0]!.swatch.y).toBe(40);
    expect(l.legend[20]!.swatch.y).toBe(40);
    expect(l.center).toEqual({ x: 225, y: 225 + 440 + 22 });
    expect(l.bounds.height).toBe(450 + 440);
  });

  it('bottom: columns of 440 px a row under the pie', () => {
    const l = lay(FIXTURES.many!, { legendPosition: 'bottom' });
    expect(columnsOf(l)).toHaveLength(2);
    expect(l.legend[0]!.swatch.y).toBe(432);
    expect(l.legend[20]!.swatch.y).toBe(432);
    expect(l.bounds.height).toBe(450 + 440);
  });

  it('the invariants accept a new column, and catch a row back over its column', () => {
    const l = lay(FIXTURES.many!);
    expect(pieLayoutViolations(FIXTURES.many!, l)).toEqual([]);
    const row = l.legend[20]!;
    const back = { ...row, swatch: { ...row.swatch, x: 441 } };
    const broken: PieLayout = { ...l, legend: l.legend.map((r, i) => (i === 20 ? back : r)) };
    expect(pieLayoutViolations(FIXTURES.many!, broken)).toContain('legend rows 19 and 20 overlap');
  });

  it('center: one column, as v12 drew it', () => {
    const l = lay(FIXTURES.many!, { legendPosition: 'center' });
    expect(columnsOf(l)).toHaveLength(1);
    // 30 rows centred on y = 225 start at 225 - 330 = -105 (D224 grows the bounds).
    expect(l.bounds.y).toBe(-105);
    // The last row's top is 533; its label's line (20.4 px) starts 0.4 px below that.
    expect(l.bounds.y + l.bounds.height).toBeCloseTo(533 + 0.4 + 20.4);
  });

  it('keeps a legend that fits the canvas in one column: 20 rows of one line', () => {
    const rows = model(Array.from({ length: 20 }, (_, i) => [`S${i}`, 1] as const));
    for (const legendPosition of ['right', 'left', 'top', 'bottom'] as const) {
      const l = lay(rows, { legendPosition });
      expect(columnsOf(l)).toHaveLength(1);
    }
    expect(lay(rows).legend[0]!.swatch.y).toBe(5);
  });

  it('breaks on the rows’ height, not their count: rows of several lines fill a column sooner', () => {
    // 15 rows of three lines (22 + 2 * 20.4 = 62.8 px): 7 fit in 450 px, the 8th starts a column.
    const tall = model(Array.from({ length: 15 }, (_, i) => [`A${i}<br>b<br>c`, 1] as const));
    const l = lay(tall);
    const xs = l.legend.map((r) => r.swatch.x);
    expect(xs.slice(0, 7).every((x) => x === xs[0])).toBe(true);
    expect(xs[7]).toBeGreaterThan(xs[0]!);
    expect(columnsOf(l)).toHaveLength(3);
    expect(l.legend[7]!.swatch.y).toBe(l.legend[0]!.swatch.y);
    for (const legendPosition of POSITIONS)
      expect(pieLayoutViolations(tall, lay(tall, { legendPosition }))).toEqual([]);
  });
});

describe('pie layout: bounds cover what is drawn (D224)', () => {
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
    expect(l.fonts.legend.family).toBe(
      createTheme(spec, { diagram: diagramTheme }).value('fontFamily')
    );
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
