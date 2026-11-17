import { beforeAll, describe, expect, it } from 'vitest';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import type { DiagramPlugin, Warning } from '@mermaid-js/core';
import { num } from '@mermaid-js/core/svg';
import { tableMeasurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, type ThemeSpec } from '@mermaid-js/core/theme';
import type { JourneyModel } from '../model.ts';
import { FIXTURES, WHOLE_WORD, journey, section, task } from './fixtures.ts';
import { layoutJourney, type JourneyLayout } from './index.ts';
import { journeyLayoutViolations } from './invariants.ts';
import { journey as diagramPlugin } from '../plugin.ts';

/** The diagram's own theme table (D331), passed to `createTheme` as the pipeline does. */
const { theme: diagramTheme }: Pick<DiagramPlugin, 'id' | 'theme'> = diagramPlugin;

const THEMES = ['default', 'redux'] as const;
type ThemeName = (typeof THEMES)[number];
const specs = new Map<ThemeName, ThemeSpec>();
beforeAll(async () => {
  for (const name of THEMES) specs.set(name, await loadTheme(name));
});

function lay(
  model: JourneyModel,
  journeyConfig: Record<string, unknown> = {},
  warnings: Warning[] = [],
  theme: ThemeName = 'default'
): JourneyLayout {
  return layoutJourney(model, {
    config: { journey: journeyConfig } as ResolvedConfig,
    measurer: tableMeasurer,
    theme: createTheme(specs.get(theme)!, { diagram: diagramTheme }),
    warn: (w) => warnings.push(w),
  });
}

const fixture = (name: string): JourneyModel => FIXTURES[name]!.model;

describe('journey layout invariants', () => {
  for (const theme of THEMES)
    for (const [config, extra] of [
      ['fixture config', {}],
      [
        'every length changed',
        {
          diagramMarginX: 20,
          diagramMarginY: 30,
          leftMargin: 90,
          maxLabelWidth: 80,
          width: 110,
          height: 70,
          taskMargin: 15,
          boxTextMargin: 12,
          taskFontSize: 20,
        },
      ],
    ] as const)
      for (const [name, { model, config: own }] of Object.entries(FIXTURES))
        it(`${name}, ${theme}, ${config}`, () => {
          const layout = lay(model, { ...own, ...extra }, [], theme);
          expect(journeyLayoutViolations(model, layout)).toEqual([]);
        });
});

describe('journey layout: v12 geometry at default config', () => {
  it('places bands at y 50 and tasks one pitch apart below them', () => {
    const layout = lay(fixture('working-day'));
    const left = layout.left;
    expect(layout.tasks.map((t) => [t.x, t.y, t.width, t.height])).toEqual(
      [0, 1, 2, 3, 4].map((i) => [left + i * 200, 110, 150, 50])
    );
    expect(layout.bands.map((b) => [b.name, b.x, b.y, b.width, b.height])).toEqual([
      ['Go to work', left, 50, 550, 50],
      ['Go home', left + 600, 50, 350, 50],
    ]);
  });

  it('draws faces at 300 + (5 − score) × 30 on the task line', () => {
    const layout = lay(fixture('working-day'));
    expect(layout.tasks.map((t) => t.face.cy)).toEqual([300, 360, 420, 300, 300]);
    for (const t of layout.tasks) {
      expect(t.face.cx).toBe(t.x + 75);
      expect(t.face.r).toBe(15);
      expect(t.line).toEqual({ x: t.x + 75, y1: 110, y2: 450 });
    }
    expect(layout.tasks.map((t) => t.face.mouth)).toEqual([
      'smile',
      'flat',
      'sad',
      'smile',
      'smile',
    ]);
  });

  it('puts legend rows 20 px apart from y 60, and task dots every 10 px', () => {
    const layout = lay(fixture('working-day'));
    expect(layout.legend.map((e) => [e.actor, e.dot.cx, e.dot.cy, e.dot.r, e.dot.slot])).toEqual([
      ['Cat', 20, 60, 7, 0],
      ['Me', 20, 80, 7, 1],
    ]);
    // v12 writes the text at x 40 and its tspan two boxTextMargins on.
    expect(layout.legend.map((e) => e.label.x)).toEqual([50, 50]);
    expect(lay(fixture('working-day'), { boxTextMargin: 0 }).legend[0]!.label.x).toBe(40);
    // The first baseline is 7 px below the dot's centre, as v12's text y.
    for (const e of layout.legend)
      expect(e.label.y + e.label.text.baseline).toBeCloseTo(e.dot.cy + 7);
    const work = layout.tasks[2]!;
    expect(work.dots.map((d) => [d.actor, d.cx, d.cy, d.r, d.slot])).toEqual([
      ['Me', work.x + 14, 110, 7, 1],
      ['Cat', work.x + 24, 110, 7, 0],
    ]);
  });

  it('draws the title at (left, baseline 25) in bold 4ex', () => {
    const layout = lay(fixture('working-day'));
    const title = layout.title!;
    expect(title.x).toBe(layout.left);
    expect(title.y + title.text.baseline).toBeCloseTo(25);
    // 4ex of the theme's 16 px.
    expect(title.text.lineHeight).toBeGreaterThan(30);
    expect(
      lay(fixture('working-day'), { titleFontSize: '20px' }).title!.text.lineHeight
    ).toBeLessThan(title.text.lineHeight);
  });

  it('ends the activity line a task margin past the last task, at 4 × height', () => {
    const layout = lay(fixture('e-commerce'));
    const last = layout.tasks[1]!;
    expect(layout.activity.y).toBe(200);
    expect(layout.activity.x1).toBe(layout.left);
    // v12: the stroke ends 4 px short of the tip so the marker's point shows.
    expect(layout.activity.x2).toBe(last.x + last.width + 50 - 4);
    expect(layout.activity.head).toBe(
      `M${num(last.x + 176)},192L${num(last.x + 176)},208L${num(last.x + 200)},200Z`
    );
  });
});

describe('journey layout: sizing (D224, D242)', () => {
  it('keeps v12’s 150 px margin while the legend fits in it', () => {
    const layout = lay(fixture('working-day'));
    expect(layout.left).toBe(150);
    expect(layout.bands[0]!.x).toBe(150);
    expect(layout.tasks[0]!.x).toBe(150);
    expect(lay(fixture('simple-test')).left).toBe(150);
  });

  it('grows the margin past a wider legend, a text inset clear of it, with no jump', () => {
    const long = lay(fixture('legend-long-labels'));
    const wide = Math.max(...long.legend.map((e) => e.label.width));
    expect(wide).toBeGreaterThan(100);
    // Legend text at 40 + 2 × 5, then the widest line, then a gap of 2 × 5.
    expect(long.left).toBeCloseTo(50 + wide + 10);
    // Just past fitting, the margin moves by the overflow only.
    const name = (n: number) => 'x'.repeat(n);
    let prev = 150;
    for (let n = 1; n < 40; n++) {
      const left = lay(journey(undefined, section('S'), task('T', 3, name(n)))).left;
      expect(left - prev).toBeLessThan(15);
      prev = left;
    }
    expect(prev).toBeGreaterThan(150);
  });

  it('gaps bands by taskMargin, not diagramMarginX', () => {
    const layout = lay(fixture('working-day'), { taskMargin: 30, diagramMarginX: 80 });
    expect(layout.bands[0]!.width).toBe(3 * 150 + 2 * 30);
    expect(layout.bands[1]!.x).toBe(layout.tasks[3]!.x);
  });

  it('bounds what is drawn with the diagram margins around it, title included', () => {
    const layout = lay(fixture('working-day'));
    const title = layout.title!;
    expect(layout.bounds.y).toBeCloseTo(title.y - 10);
    // The lowest face place (a score of 0) is reserved by every task line.
    expect(layout.bounds.y + layout.bounds.height).toBeCloseTo(450 + 10);
    expect(layout.bounds.x).toBeCloseTo(20 - 7.5 - 50);
    const last = layout.tasks[4]!;
    expect(layout.bounds.x + layout.bounds.width).toBeCloseTo(last.x + last.width + 50 + 50);
  });

  it('grows to hold a tall legend instead of v12’s fixed 450 px height', () => {
    const many = journey(
      undefined,
      section('S'),
      task('T', 3, ...Array.from({ length: 30 }, (_, i) => `actor ${String(i).padStart(2, '0')}`))
    );
    const layout = lay(many);
    const lowest = layout.legend.at(-1)!;
    expect(lowest.dot.cy).toBe(60 + 29 * 20);
    expect(layout.bounds.y + layout.bounds.height).toBeGreaterThan(
      lowest.label.y + lowest.label.height
    );
  });
});

describe('journey layout: scores (D226)', () => {
  it('draws NaN at 3 with a flat mouth, 0 at the bottom, 7 clamped to 5 and smiling', () => {
    const warnings: Warning[] = [];
    const layout = lay(fixture('odd-scores'), {}, warnings);
    expect(layout.tasks.map((t) => [t.drawnScore, t.face.cy, t.face.mouth])).toEqual([
      [3, 360, 'flat'],
      [0, 450, 'sad'],
      [5, 300, 'smile'],
      [0, 450, 'sad'],
      [2.5, 375, 'sad'],
    ]);
  });

  it('warns JOURNEY_SCORE once per render, and not for scores from 0 to 5', () => {
    const warnings: Warning[] = [];
    lay(fixture('odd-scores'), {}, warnings);
    expect(warnings.map((w) => w.code)).toEqual(['JOURNEY_SCORE']);
    expect(warnings[0]!.message).toContain('Not a number');
    const clean: Warning[] = [];
    lay(journey(undefined, section('S'), task('Zero', 0), task('Five', 5)), {}, clean);
    expect(clean).toEqual([]);
  });

  it('builds v12’s mouth arcs (radii 7.5 and 6.8) as absolute paths', () => {
    const [nan, zero, seven] = lay(fixture('odd-scores')).tasks;
    const at = (t: typeof nan) => [t!.face.cx, t!.face.cy] as const;
    const [sx, sy] = at(seven);
    expect(seven!.face.mouthPath).toBe(
      `M${num(sx + 7.5)},${sy + 2}A7.5,7.5 0 1,1 ${num(sx - 7.5)},${sy + 2}L${num(sx - 6.82)},${sy + 2}A6.82,6.82 0 1,0 ${num(sx + 6.82)},${sy + 2}Z`
    );
    const [zx, zy] = at(zero);
    expect(zero!.face.mouthPath).toBe(
      `M${num(zx - 7.5)},${zy + 7}A7.5,7.5 0 1,1 ${num(zx + 7.5)},${zy + 7}L${num(zx + 6.82)},${zy + 7}A6.82,6.82 0 1,0 ${num(zx - 6.82)},${zy + 7}Z`
    );
    const [nx, ny] = at(nan);
    expect(nan!.face.mouthPath).toBe(`M${num(nx - 5)},${ny + 7}L${num(nx + 5)},${ny + 7}`);
    expect(nan!.face.eyes).toEqual([
      { cx: nx - 5, cy: ny - 5, r: 1.5 },
      { cx: nx + 5, cy: ny - 5, r: 1.5 },
    ]);
  });
});

describe("journey layout: the '' actor (D244)", () => {
  it('draws no legend row and no dot for it, and colours only the named actors', () => {
    const layout = lay(fixture('before-first-section'));
    expect(layout.legend.map((e) => [e.actor, e.dot.slot])).toEqual([
      ['A', 0],
      ['B', 1],
    ]);
    const early = layout.tasks[0]!;
    expect(early.dots.map((d) => [d.actor, d.cx - early.x, d.slot])).toEqual([
      ['A', 14, 0],
      ['B', 24, 1],
    ]);
  });

  it('leaves the margin at leftMargin when only the empty actor is named', () => {
    const layout = lay(fixture('left-margin-150px'));
    expect(layout.legend).toEqual([]);
    expect(layout.left).toBe(150);
    expect(layout.tasks.flatMap((t) => t.dots)).toEqual([]);
  });
});

describe('journey layout: sections', () => {
  it('finds the band’s line by name when sectionIndex is missing, never section 0', () => {
    const layout = lay(fixture('missing-section-index'));
    expect(layout.bands.map((b) => [b.ast, b.section])).toEqual([
      ['s:A@2', 2],
      ['s:Gone', undefined],
    ]);
  });

  it('cycles band slots over the eight fillTypes (D241)', () => {
    expect(lay(fixture('eight-sections')).bands.map((b) => b.slot)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7,
    ]);
    const nine = lay(fixture('nine-sections'));
    expect(nine.bands.map((b) => b.slot)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 0]);
    expect(nine.tasks.map((t) => t.slot)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 0]);
  });

  it('draws a band per run of tasks, with the AST id of the line that opened it', () => {
    const layout = lay(fixture('legend-long-labels'));
    expect(layout.bands.map((b) => [b.ast, b.section, b.slot])).toEqual([
      ['s:Darkoob', 0, 0],
      ['s:External Service', 1, 1],
      ['s:Darkoob@2', 2, 2],
    ]);
    expect(layout.tasks.map((t) => t.band)).toEqual([0, 0, 0, 1, 1, 1, 2, 2]);
  });

  it('draws no band for an empty section or for tasks before the first section', () => {
    expect(lay(fixture('simple-test')).bands).toEqual([]);
    const layout = lay(fixture('before-first-section'));
    // v12 compares names: a repeated section line straight after the first keeps one band.
    expect(layout.bands.map((b) => [b.ast, b.x])).toEqual([['s:Later@2', layout.tasks[1]!.x]]);
    expect(layout.tasks[0]!.band).toBeUndefined();
    expect(layout.tasks[0]!.slot).toBe(0);
  });
});

describe('journey layout: labels (D225)', () => {
  it('grows a task box and a band downward for a label taller than them', () => {
    const layout = lay(fixture('three-line-labels'));
    const [tall, short] = layout.tasks;
    expect(tall!.label!.text.lines.length).toBe(3);
    expect(tall!.y).toBe(110);
    expect(tall!.height).toBeCloseTo(tall!.label!.height);
    expect(tall!.height).toBeGreaterThan(50);
    expect(short!.height).toBe(50);
    expect(tall!.dots[0]!.cy).toBe(110);
    expect(tall!.face.cy).toBe(330);
    const band = layout.bands[0]!;
    expect(band.label!.text.lines.length).toBe(3);
    expect(band.y).toBe(50);
    expect(band.height).toBeCloseTo(band.label!.height);
  });

  it('wraps legend labels to maxLabelWidth and steps rows by their height', () => {
    const layout = lay(fixture('whitespace-wrapping-no-hyphens'), { maxLabelWidth: 200 });
    const [entry] = layout.legend;
    expect(entry!.label.text.lines.length).toBeGreaterThan(1);
    expect(entry!.label.width).toBeLessThanOrEqual(200);
    const two = lay(fixture('wrap-long-labels-multiline-margins'), { maxLabelWidth: 320 }).legend;
    expect(two[1]!.dot.cy - two[0]!.dot.cy).toBeCloseTo(Math.max(20, two[0]!.label.height));
  });

  it('wraps task and section names to their box, and breaks at <br>', () => {
    const layout = lay(fixture('line-breaks'));
    const t = layout.tasks[0]!;
    expect(t.label!.text.lines.length).toBeGreaterThan(1);
    expect(t.label!.width).toBeLessThanOrEqual(150);
    expect(t.label!.x + t.label!.width / 2).toBeCloseTo(t.x + 75);
    expect(t.label!.y + t.label!.height / 2).toBeCloseTo(t.y + t.height / 2);
    expect(layout.bands[0]!.label!.text.lines.length).toBe(2);
    expect(layout.title!.text.lines.length).toBe(2);
    expect(layout.legend[0]!.label.text.lines.length).toBe(2);
  });

  it('measures task labels in taskFontSize, the theme size when unset', () => {
    const small = lay(fixture('e-commerce'), { taskFontSize: 10 }).tasks[0]!.label!;
    const big = lay(fixture('e-commerce'), { taskFontSize: '2em' }).tasks[0]!.label!;
    const theme = lay(fixture('e-commerce')).tasks[0]!.label!;
    expect(small.text.lineHeight).toBeLessThan(theme.text.lineHeight);
    expect(big.text.lineHeight).toBeGreaterThan(theme.text.lineHeight);
  });

  it('leaves out the labels of names with no text', () => {
    const layout = lay(fixture('blank-names'));
    expect(layout.title).toBeUndefined();
    expect(layout.bands[0]!.label).toBeUndefined();
    expect(layout.tasks[0]!.label).toBeUndefined();
    expect(layout.tasks[1]!.label).toBeDefined();
  });
});

describe('journey layout: long words stay whole (#649, D558)', () => {
  const lines = (l: { text: { lines: readonly { text: string }[][] } }): string[] =>
    l.text.lines.map((line) => line.map((r) => r.text).join(''));

  it('widens only the box of a task or section name wider than it, as much as the word', () => {
    const model = fixture('long-words');
    const layout = lay(model);
    const [one, long, three, four, five, six] = layout.tasks;
    const [first, wide, last] = layout.bands;
    expect(lines(long!.label!)).toEqual([WHOLE_WORD]);
    expect(lines(wide!.label!)).toEqual([WHOLE_WORD + WHOLE_WORD]);
    // Short names keep v12's 150 px boxes; the long one is as wide as its word.
    for (const t of [one, three, six]) expect(t!.width).toBe(150);
    expect(long!.width).toBeCloseTo(long!.label!.width);
    expect(long!.width).toBeGreaterThan(150);
    // Tasks stay taskMargin (50) apart; the line and face stay on the box's centre.
    expect(long!.x).toBe(one!.x + 200);
    expect(three!.x).toBeCloseTo(long!.x + long!.width + 50);
    expect(long!.line.x).toBeCloseTo(long!.x + long!.width / 2);
    // A section wider than its tasks shares the extra width out among them.
    expect(wide!.width).toBeCloseTo(wide!.label!.width);
    expect(four!.width).toBeCloseTo(five!.width);
    expect(four!.width + 50 + five!.width).toBeCloseTo(wide!.width);
    expect([four!.x, five!.x + five!.width]).toEqual([wide!.x, wide!.x + wide!.width]);
    expect(first!.width).toBeCloseTo(one!.width + long!.width + three!.width + 100);
    expect(last!.x).toBeCloseTo(wide!.x + wide!.width + 50);
    expect(journeyLayoutViolations(model, layout)).toEqual([]);
  });

  it('lays out names that fit exactly as before', () => {
    const layout = lay(fixture('working-day'));
    expect(layout.tasks.map((t) => [t.x, t.width])).toEqual([
      [150, 150],
      [350, 150],
      [550, 150],
      [750, 150],
      [950, 150],
    ]);
  });

  it('still wraps legend names to maxLabelWidth (D225)', () => {
    const layout = lay(journey(undefined, section('S'), task('T', 3, WHOLE_WORD)), {
      maxLabelWidth: 100,
    });
    expect(layout.legend[0]!.label.text.lines.length).toBeGreaterThan(1);
  });
});

describe('journeyLayoutViolations', () => {
  const model = fixture('working-day');
  const good = (): JourneyLayout => lay(model);
  const withTask = (layout: JourneyLayout, i: number, patch: object): JourneyLayout => ({
    ...layout,
    tasks: layout.tasks.map((t, j) => (j === i ? { ...t, ...patch } : t)),
  });

  it('reports NaN in numbers and in path data', () => {
    const layout = good();
    expect(journeyLayoutViolations(model, { ...layout, left: NaN })).toEqual([
      'layout.left is NaN',
    ]);
    const face = { ...layout.tasks[0]!.face, mouthPath: 'MNaN,0' };
    expect(journeyLayoutViolations(model, withTask(layout, 0, { face }))).toEqual([
      'layout.tasks[0].face.mouthPath is "MNaN,0"',
    ]);
  });

  it('reports a task outside its band, a face off its line and a missing task', () => {
    const layout = good();
    const moved = withTask(layout, 2, { x: layout.tasks[2]!.x + 100 });
    expect(journeyLayoutViolations(model, moved).join('\n')).toMatch(
      /task t:3 .* is outside its band s:Go to work/
    );
    const face = { ...layout.tasks[0]!.face, cx: 0 };
    expect(journeyLayoutViolations(model, withTask(layout, 0, { face }))).toContain(
      'task t:1: its face (0, 300) is not on its line'
    );
    expect(journeyLayoutViolations(model, { ...layout, tasks: layout.tasks.slice(1) })[0]).toBe(
      '4 tasks laid out for 5 in the model'
    );
  });

  it('reports a task or band label outside its box', () => {
    const tall = fixture('three-line-labels');
    const layout = lay(tall);
    const squashed = {
      ...layout,
      tasks: layout.tasks.map((t, i) => (i === 0 ? { ...t, height: 50 } : t)),
      bands: layout.bands.map((b, i) => (i === 0 ? { ...b, height: 50 } : b)),
    };
    expect(journeyLayoutViolations(tall, squashed)).toEqual([
      'task t:1: its label is outside its box',
      'band s:A section name long enough to wrap onto three lines: its label is outside its box',
    ]);
  });

  it('reports overlapping legend rows, a dot for the empty actor and short bounds', () => {
    const layout = good();
    const [cat, me] = layout.legend;
    const legend = [
      cat!,
      { ...me!, dot: { ...me!.dot, cy: cat!.dot.cy }, label: { ...me!.label, y: cat!.label.y } },
    ];
    expect(journeyLayoutViolations(model, { ...layout, legend })).toEqual([
      'legend row "Cat" overlaps "Me"',
    ]);
    const dots = [{ ...layout.tasks[0]!.dots[0]!, actor: '' }];
    expect(journeyLayoutViolations(model, withTask(layout, 0, { dots }))).toEqual([
      "task t:1 draws a dot for the '' actor",
    ]);
    const bounds = { ...layout.bounds, height: 100 };
    expect(journeyLayoutViolations(model, { ...layout, bounds }).length).toBeGreaterThan(0);
  });
});
