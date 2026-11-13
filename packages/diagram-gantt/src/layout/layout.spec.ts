import { beforeAll, describe, expect, it } from 'vitest';
import { MermaidError, type Warning } from '@mermaid-js/core';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import { inlineSpans, tableMeasurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, type ThemeSpec } from '@mermaid-js/core/theme';
import type { GanttModel } from '../model.ts';
import { parseGantt } from '../parser/index.ts';
import { fixture, type LayoutFixture } from './fixtures.ts';
import { ganttLayoutViolations, layoutGantt, type GanttLayout } from './index.ts';

// Spec #293 T3: the layout seam, on hand-built models. Expected numbers are v12's formulas
// (`ganttRenderer.js` at fa796a943) worked by hand at the schema defaults: w 1200, padding 75
// each side (plot 1050), barHeight 20 + barGap 4 (a 24 px row), topPadding 50. Dates are local
// and DST-free, so each case holds in both gantt zones.
let spec: ThemeSpec;
beforeAll(async () => {
  spec = await loadTheme('default');
});

const NOW = new Date(2031, 4, 6, 9, 30).getTime();
const at = (y: number, m: number, d: number, h = 0): number => new Date(y, m - 1, d, h).getTime();

interface Run {
  readonly layout: GanttLayout;
  readonly warnings: Warning[];
}

function lay(
  f: LayoutFixture | GanttModel,
  gantt: Record<string, unknown> = {},
  extra: { now?: number; availableWidth?: number } = {}
): Run {
  const warnings: Warning[] = [];
  const model = 'model' in f ? f.model() : f;
  const layout = layoutGantt(model, {
    config: { gantt } as ResolvedConfig,
    measurer: tableMeasurer,
    theme: createTheme(spec),
    warn: (w) => warnings.push(w),
    now: 'now' in extra ? extra.now! : NOW,
    ...(extra.availableWidth !== undefined ? { availableWidth: extra.availableWidth } : {}),
  });
  expect(ganttLayoutViolations(layout)).toEqual([]);
  return { layout, warnings };
}

const two = (): LayoutFixture =>
  fixture().addSection('A').addTask('a', 'a,2014-01-01,2d').addTask('b', 'b,after a,2d');

describe('gantt layout follows ganttRenderer.js', () => {
  it('sizes the chart: w 1200, h = 2·topPadding + rows·(barHeight + barGap)', () => {
    const { layout } = lay(two());
    expect([layout.width, layout.height, layout.rows]).toEqual([1200, 148, 2]);
    expect(layout.plot).toEqual({ x: 75, width: 1050 });
    expect(layout.domain).toEqual({ start: at(2014, 1, 1), end: at(2014, 1, 5) });
  });

  it('places bars on a rounded time scale, a row per task', () => {
    const { layout } = lay(two());
    expect(layout.bars.map((b) => [b.id, b.x, b.y, b.width, b.height, b.radius])).toEqual([
      ['a', 75, 50, 525, 20, 3],
      ['b', 600, 74, 525, 20, 3],
    ]);
    expect(layout.bars.map((b) => b.ast)).toEqual(['t:a', 't:b']);
  });

  it('draws a band per row, 2 px above the bar, w − rightPadding / 2 wide', () => {
    const { layout } = lay(two());
    expect(layout.bands).toEqual([
      { x: 0, y: 48, width: 1162.5, height: 24, slot: 0 },
      { x: 0, y: 72, width: 1162.5, height: 24, slot: 0 },
    ]);
  });

  it('centres a label that fits, its baseline at fontSize / 2 − 2 below the bar middle', () => {
    const { layout } = lay(two());
    const [a] = layout.bars;
    expect([a!.label.x, a!.label.y, a!.label.anchor, a!.label.side]).toEqual([
      337.5,
      63.5,
      'middle',
      'inside',
    ]);
  });

  it('puts a label that does not fit right of its bar, or left when that would pass w', () => {
    const long = 'a label much wider than a short bar on the axis';
    const { layout } = lay(
      fixture().addTask(long, 'a,2014-01-01,1h').addTask(long, 'b,2014-01-02,1h')
    );
    // Domain Jan 1 00:00 … Jan 2 01:00 (25 h). a ends at round(1050 / 25) = 42: right, at endX + 75 + 5.
    const [a, b] = layout.bars;
    expect([a!.label.side, a!.label.anchor, a!.label.x]).toEqual(['right', 'start', 42 + 80]);
    // b starts at round(1050 · 24 / 25) = 1008 and ends at 1050, where endX + text + 1.5·75
    // passes 1200: left, at startX + 75 − 5.
    expect([b!.label.side, b!.label.anchor, b!.label.x]).toEqual(['left', 'end', 1008 + 70]);
  });

  it('measures labels in the font they are drawn in: bold when clickable, italic for milestones', () => {
    const plain = lay(fixture().addTask('Some task', 'a,2014-01-01,1d')).layout.bars[0]!;
    const bold = lay(fixture().addTask('Some task', 'a,2014-01-01,1d').click('a')).layout.bars[0]!;
    expect(bold.clickable).toBe(true);
    expect(bold.label.text.width).toBeGreaterThan(plain.label.text.width);
    expect(plain.label.text.lines[0]![0]!.style).toBe(0);
  });

  it('shows markup in task labels as written, decodes entities, and breaks section titles on <br>', () => {
    // The model holds an entity code as `&name;` (`#amp;` and a typed `&amp;` alike, D563).
    const { layout } = lay(
      fixture()
        .addSection('One<br>Two</br>Three')
        .addTask('a <b>b</b> &amp; &#35;c &lt;i&gt;\\n', 'a,2014-01-01,1d')
    );
    const text = layout.bars[0]!.label.text;
    expect(text.lines.map((l) => l.map((r) => r.text).join(''))).toEqual([
      'a <b>b</b> & #c <i>\\n',
    ]);
    const section = layout.sections[0]!;
    expect(section.text.lines.map((l) => l.map((r) => r.text).join(''))).toEqual([
      'One',
      'Two',
      'Three',
    ]);
    expect([section.x, section.y, section.lineHeight]).toEqual([10, 62, 11]);
  });

  it('centres section titles on their rows, in v12 object-key order', () => {
    const { layout } = lay(
      fixture()
        .addSection('b')
        .addTask('t1', 'a,2014-01-01,1d')
        .addSection('2')
        .addTask('t2', 'b,2014-01-01,1d')
        .addTask('t3', 'c,2014-01-01,1d')
        .addSection('1')
        .addTask('t4', 'd,2014-01-01,1d')
    );
    // Integer-like names first, ascending: "1" (1 row), "2" (2 rows), then "b" (1 row).
    expect(layout.sections.map((s) => [s.section, s.rows, s.y, s.slot])).toEqual([
      ['1', 1, 62, 2],
      ['2', 2, 98, 1],
      ['b', 1, 134, 0],
    ]);
  });

  it('cycles colour slots with numberSectionStyles', () => {
    const f = fixture();
    for (const s of ['s0', 's1', 's2']) f.addSection(s).addTask(s, `${s},2014-01-01,1d`);
    const { layout } = lay(f, { numberSectionStyles: 2 });
    expect(layout.bars.map((b) => b.slot)).toEqual([0, 1, 0]);
  });

  it('packs a section into the fewest rows in compact mode, per section name', () => {
    const f = fixture()
      .addSection('A')
      .addTask('a1', 'a1,2014-01-01,2d')
      .addTask('a2', 'a2,2014-01-02,2d')
      .addTask('a3', 'a3,2014-01-03,2d')
      .addSection('B')
      .addTask('b1', 'b1,2014-01-01,1d');
    const { layout } = lay(f, { displayMode: 'compact' });
    // a1 and a3 share lane 0 (a3 starts when a1 ends), a2 takes lane 1; B starts at row 2.
    expect(layout.rows).toBe(3);
    expect(layout.height).toBe(100 + 3 * 24);
    expect(layout.bars.map((b) => [b.id, (b.y - 50) / 24])).toEqual([
      ['a1', 0],
      ['b1', 2],
      ['a2', 1],
      ['a3', 0],
    ]);
    expect(layout.bands.map((b) => b.y)).toEqual([48, 96, 72]);
    expect(layout.sections.map((s) => [s.section, s.rows])).toEqual([
      ['A', 2],
      ['B', 1],
    ]);
  });

  it('draws milestones at their square, centred on the span, and vert markers without a row', () => {
    const { layout } = lay(
      fixture()
        .addTask('a', 'a,2014-01-01,4d')
        .addTask('m', 'milestone, m, 2014-01-03, 0d')
        .addTask('v', 'vert, v, 2014-01-02, 0d')
    );
    expect(layout.rows).toBe(2);
    const m = layout.bars.find((b) => b.kind === 'milestone')!;
    expect([m.x, m.y, m.width, m.scale]).toEqual([75 + 525 - 10, 74, 20, 0.8]);
    const v = layout.bars.at(-1)!;
    expect(v.kind).toBe('vert');
    // x at round(1050 / 4); 0.08 bar heights wide; from gridLineStartPadding over the rows and two bars.
    expect([v.x, v.y, v.width, v.height]).toEqual([75 + 263, 35, 1.6, 2 * 24 + 40]);
    expect([v.label.x, v.label.y, v.label.anchor]).toEqual([75 + 263, 35 + 48 + 60, 'middle']);
  });

  it('ends a bar where excluded days begin, pushing the end out', () => {
    // 2019-02-01 is a Friday: 1d plus the weekend ends on Monday, the bar on Saturday.
    const { layout } = lay(
      fixture()
        .setExcludes('weekends')
        .addTask('a', 'a,2019-02-01,1d')
        .addTask('b', 'b,2019-02-01,2019-02-05')
    );
    const [a] = layout.bars;
    expect(a!.end).toBe(at(2019, 2, 4));
    // Domain Feb 1 … Feb 5 (4 days): the bar is 1 day of it.
    expect(a!.width).toBe(Math.round(1050 / 4));
  });

  it('draws excluded runs from start to end of day, dropping a run still open at the end', () => {
    const { layout } = lay(
      fixture()
        .setExcludes('weekends')
        .addTask('a', 'a,2019-02-01,2019-02-04')
        .addTask('b', 'b,2019-02-08,2019-02-10')
    );
    // Domain Fri Feb 1 … Sun Feb 10: Sat 2 – Sun 3 is drawn; Sat 9 – Sun 10 is still open at the end.
    // A day is 1050 / 9 px: Feb 2 00:00 at round(116.7) = 117, Feb 3 23:59:59.999 at round(350.0) = 350.
    expect(layout.excludes).toEqual([{ x: 75 + 117, y: 35, width: 350 - 117, height: 148 - 85 }]);
  });

  it('skips exclude ranges over more than five years, with a warning', () => {
    const { layout, warnings } = lay(
      fixture().setExcludes('weekends').addTask('a', 'a,2014-01-01,2020-01-02')
    );
    expect(layout.excludes).toEqual([]);
    expect(warnings.map((w) => w.code)).toEqual(['GANTT_EXCLUDES_NOT_DRAWN']);
  });

  it('draws the today line only when now is in the domain (D275)', () => {
    const inside = lay(two(), {}, { now: at(2014, 1, 2, 12) }).layout.today;
    expect(inside).toEqual({ x: 75 + Math.round(1050 * (1.5 / 4)), y1: 25, y2: 148 - 25 });
    expect(lay(two()).layout.today).toBeUndefined();
    expect(
      lay(two().setTodayMarker('off'), {}, { now: at(2014, 1, 2) }).layout.today
    ).toBeUndefined();
    const styled = lay(two().setTodayMarker('stroke:red'), {}, { now: at(2014, 1, 2) }).layout;
    expect(styled.today!.style).toBe('stroke:red');
  });

  it('centres the title at w / 2 on titleTopMargin, and draws none when empty', () => {
    const { layout } = lay(two().setDiagramTitle('Plan'));
    expect([layout.title!.x, layout.title!.y, layout.title!.anchor]).toEqual([600, 25, 'middle']);
    expect(layout.title!.text.lineHeight).toBeGreaterThan(18);
    expect(lay(two().setDiagramTitle('  ')).layout.title).toBeUndefined();
  });

  it('takes the width from gantt.useWidth, then availableWidth, then 1200 (D272)', () => {
    expect(lay(two(), {}, { availableWidth: 800 }).layout.width).toBe(800);
    expect(lay(two(), { useWidth: 600 }, { availableWidth: 800 }).layout.width).toBe(600);
    expect(lay(two()).layout.plot.width).toBe(1050);
  });

  it('reads gantt.* lengths, warning once for a value it cannot use', () => {
    const { layout, warnings } = lay(two(), { barHeight: 30, barGap: 10, topPadding: 'x' });
    expect(layout.height).toBe(100 + 2 * 40);
    expect(warnings.map((w) => [w.code, w.path])).toEqual([
      ['GANTT_CONFIG_IGNORED', 'gantt.topPadding'],
    ]);
  });
});

describe('the time axis', () => {
  it('puts the bottom axis at h − 50, tick lines up to topPadding + gridLineStartPadding', () => {
    const { bottomAxis } = lay(two()).layout;
    expect([bottomAxis.y, bottomAxis.y1, bottomAxis.y2, bottomAxis.labelY]).toEqual([
      98,
      98,
      35,
      98 + 13,
    ]);
    // d3 picks 12-hour ticks for 4 days at 10 ticks.
    expect(bottomAxis.ticks).toHaveLength(9);
    expect(bottomAxis.ticks[0]).toMatchObject({ time: at(2014, 1, 1), x: 75, label: '2014-01-01' });
    expect(bottomAxis.ticks.at(-1)).toMatchObject({ x: 1125, label: '2014-01-05' });
  });

  it('honours tickInterval and axisFormat, statement first', () => {
    const { bottomAxis } = lay(two().setTickInterval('1day').setAxisFormat('%a %d'), {
      tickInterval: '1week',
    }).layout;
    expect(bottomAxis.ticks.map((t) => t.label)).toEqual([
      'Wed 01',
      'Thu 02',
      'Fri 03',
      'Sat 04',
      'Sun 05',
    ]);
  });

  it('starts week ticks on the weekday statement, then gantt.weekday, then Sunday (D279)', () => {
    const f = (): LayoutFixture =>
      fixture().addTask('a', 'a,2014-01-01,30d').setTickInterval('1week');
    const day = (l: GanttLayout): number => new Date(l.bottomAxis.ticks[0]!.time).getDay();
    expect(day(lay(f()).layout)).toBe(0);
    expect(day(lay(f(), { weekday: 'monday' }).layout)).toBe(1);
    expect(day(lay(f().setWeekday('friday'), { weekday: 'monday' }).layout)).toBe(5);
  });

  it('falls back to automatic ticks past 10,000, with a warning', () => {
    const { layout, warnings } = lay(
      fixture().addTask('a', 'a,2014-01-01,365d').setTickInterval('1millisecond')
    );
    expect(layout.bottomAxis.ticks.length).toBeLessThan(20);
    expect(warnings.map((w) => w.code)).toEqual(['GANTT_TICK_INTERVAL_IGNORED']);
  });

  it('formats dateFormat D as %d', () => {
    const { bottomAxis } = lay(
      new (fixture().constructor as new () => LayoutFixture)()
        .setDateFormat('D')
        .addTask('a', 'a,1,3d')
    ).layout;
    expect(bottomAxis.ticks[0]!.label).toMatch(/^\d\d$/);
  });

  it('draws a top axis for the statement or gantt.topAxis (D273)', () => {
    expect(lay(two()).layout.topAxis).toBeUndefined();
    const top = lay(two().enableTopAxis()).layout.topAxis!;
    expect([top.y, top.y1, top.y2, top.labelY]).toEqual([50, 50, 148 - 35, 47]);
    expect(lay(two(), { topAxis: true }).layout.topAxis).toBeDefined();
  });
});

describe('nothing to schedule (D277)', () => {
  it('draws the title and an empty plot without ticks, with no warning', () => {
    const { layout, warnings } = lay(fixture().setDiagramTitle('Empty'));
    expect(layout.domain).toBeUndefined();
    expect([layout.rows, layout.height, layout.bars, layout.bottomAxis.ticks]).toEqual([
      0,
      100,
      [],
      [],
    ]);
    expect(layout.title).toBeDefined();
    expect(warnings).toEqual([]);
  });

  it('treats a chart of only vert markers as empty', () => {
    const { layout } = lay(fixture().addTask('v', 'vert, v, 2014-01-02, 0d'));
    expect([layout.domain, layout.bars]).toEqual([undefined, []]);
  });

  it('maps a one-instant domain to the middle, with no automatic ticks', () => {
    const { layout } = lay(fixture().addTask('m', 'milestone, m, 2014-01-02, 0d'));
    expect(layout.bars[0]!.x).toBe(75 + 525 - 10);
    expect(layout.bottomAxis.ticks).toEqual([]);
  });

  it('keeps the row of a task that never resolves, and draws no bar for it', () => {
    const { layout } = lay(fixture().addTask('a', 'a,after b,1d').addTask('b', 'b,after a,1d'));
    expect([layout.rows, layout.bands.length, layout.bars]).toEqual([2, 2, []]);
  });
});

describe('warnings and errors (D274, D276)', () => {
  it('warns once for unknown after, until and click ids, and once for bad durations', () => {
    const { warnings } = lay(
      fixture()
        .addTask('a', 'a,after x,1d')
        .addTask('b', 'b,after y x,1d')
        .addTask('c', 'c,2014-01-01,until z')
        .addTask('d', 'd,2014-01-01,soon')
        .addTask('e', 'e,2014-01-01,later')
        .click('a', 'w')
    );
    expect(warnings.map((w) => w.code)).toEqual(['GANTT_UNKNOWN_TASK', 'GANTT_BAD_DURATION']);
    expect(warnings[0]!.message).toContain('"x", "y", "z", "w"');
    expect(warnings[1]!.message).toContain('"soon", "later"');
  });

  it('rejects a schedule error as SEMANTIC at the task data', () => {
    const source = 'gantt\n  dateFormat YYYY-MM-DD\n  a :a, 2014-01-01, 1d\n  b :b, someday, 1d';
    let error: unknown;
    try {
      lay(parseGantt(source).model);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(MermaidError);
    const e = error as MermaidError;
    // At the `:` of `b`'s data, line 4 column 5.
    expect([e.code, e.line, e.column]).toEqual(['SEMANTIC', 4, 5]);
    expect(e.diagnostics[0]!.code).toBe('GANTT_INVALID_DATE');
    expect(e.message).toContain('Invalid date:someday');
  });

  it.each([
    ['a first task with no start', 'a :1d', 'GANTT_NO_START'],
    ['too many fields', 'a :a,b,2014-01-01,1d', 'GANTT_TOO_MANY_FIELDS'],
  ])('rejects %s', (_name, task, code) => {
    expect(() => lay(parseGantt(`gantt\ndateFormat YYYY-MM-DD\n${task}`).model)).toThrow(
      expect.objectContaining({
        code: 'SEMANTIC',
        diagnostics: [expect.objectContaining({ code })],
      })
    );
  });

  it.each([NaN, Infinity, undefined])('rejects now = %s rather than draw NaN', (now) => {
    expect(() => lay(two(), {}, { now: now as number })).toThrow(/valid "now"/);
  });
});

describe('the invariants', () => {
  it('catch NaN, a bar off the plot, overlapping compact rows and unsorted ticks', () => {
    const { layout } = lay(two(), { displayMode: 'compact' });
    const [a, b] = layout.bars;
    const broken: GanttLayout = {
      ...layout,
      bars: [{ ...a!, x: NaN }, b!],
    };
    expect(ganttLayoutViolations(broken)).toEqual(['layout.bars.0.x is NaN']);
    const off: GanttLayout = {
      ...layout,
      bars: [
        { ...a!, x: 2000 },
        { ...b!, y: a!.y, start: a!.start },
      ],
      bottomAxis: { ...layout.bottomAxis, ticks: [...layout.bottomAxis.ticks].reverse() },
    };
    const found = ganttLayoutViolations(off);
    expect(found).toContain('bar "a" is outside the plot');
    expect(found).toContain(`two bars in the row at y=${a!.y} overlap`);
    expect(found.some((v) => v.includes('not ascending'))).toBe(true);
  });
});

describe('review fixes (#379 fix round)', () => {
  const parsed = (src: string): GanttModel => parseGantt(src).model;

  it('marks the task a click names as v12 parse-time setClass did: the latest one before it', () => {
    const { layout } = lay(
      parsed(
        'gantt\ndateFormat YYYY-MM-DD\nclick a href "u"\na :a,2024-01-01,3d\nb :b,2024-01-02,3d\n' +
          'click b href "u"\nb :b,2024-01-05,3d'
      )
    );
    const byTask = new Map(layout.bars.map((b) => [b.task, b.clickable]));
    expect([byTask.get(0), byTask.get(1), byTask.get(2)]).toEqual([false, true, false]);
  });

  it('gives a compact section whose tasks never resolve one lane and its title', () => {
    const { layout } = lay(
      parsed(
        'gantt\ndateFormat YYYY-MM-DD\nsection A\na :a,2024-01-01,3d\nsection B\nc :c, after c, 1d'
      ),
      { displayMode: 'compact' }
    );
    expect([layout.rows, layout.height]).toEqual([2, 148]);
    expect(layout.sections.map((s) => [s.section, s.rows])).toEqual([
      ['A', 1],
      ['B', 1],
    ]);
  });

  it("estimates a month as dayjs's 365 / 12 days, so 9,900 monthly ticks are drawn", () => {
    const { layout, warnings } = lay(
      fixture().setTickInterval('1month').addTask('a', 'a,2000-01-01,2825-01-01')
    );
    expect(warnings).toEqual([]);
    expect(layout.bottomAxis.ticks).toHaveLength(9901);
  });

  it('draws d3 ticks over a reversed domain, warning for a tickInterval as v12 did', () => {
    const f = (): LayoutFixture => fixture().addTask('a', 'a, 2024-01-10, 2024-01-05');
    const auto = lay(f());
    expect(auto.layout.domain).toEqual({ start: at(2024, 1, 10), end: at(2024, 1, 5) });
    expect(auto.layout.bottomAxis.ticks).toHaveLength(11);
    expect(auto.warnings).toEqual([]);
    const every = lay(f().setTickInterval('1day'));
    expect(every.layout.bottomAxis.ticks).toHaveLength(11);
    expect(every.warnings.map((w) => w.code)).toEqual(['GANTT_TICK_INTERVAL_IGNORED']);
  });

  it.each([NaN, 0, -5, Infinity])('ignores availableWidth %s, falling back to 1200', (w) => {
    expect(lay(two(), {}, { availableWidth: w }).layout.width).toBe(1200);
  });
});

describe('final review fixes', () => {
  const parsed = (src: string): GanttModel => parseGantt(src).model;

  it('warns GANTT_UNKNOWN_TASK for a click naming no task written before it', () => {
    const { warnings } = lay(
      parsed('gantt\ndateFormat YYYY-MM-DD\nclick a href "u"\na :a, 2024-01-01, 3d')
    );
    expect(warnings.map((w) => w.code)).toEqual(['GANTT_UNKNOWN_TASK']);
    expect(warnings[0]!.message).toContain('"a"');
  });

  it('shows a math span as written when no inline provider takes it', () => {
    const { layout } = lay(fixture().addTask('$$<b>x</b>$$ & y', 'a,2014-01-01,1d'));
    const runs = layout.bars[0]!.label.text.lines.flat();
    expect(runs.map((r) => r.text).join('')).toBe('$$<b>x</b>$$ & y');
    expect(runs.every((r) => r.style === 0)).toBe(true);
  });

  it('passes a math span an inline provider takes through untouched', () => {
    const inline = inlineSpans(
      [
        {
          open: '$$',
          close: '$$',
          box: () => ({ width: 8, height: 10, baseline: 8, node: { tag: 'rect', attrs: {} } }),
        },
      ],
      () => undefined
    );
    const layout = layoutGantt(fixture().addTask('$$<b>x</b>$$ & y', 'a,2014-01-01,1d').model(), {
      config: { gantt: {} } as ResolvedConfig,
      measurer: tableMeasurer,
      theme: createTheme(spec),
      warn: () => undefined,
      now: NOW,
      inline,
    });
    const runs = layout.bars[0]!.label.text.lines.flat();
    expect(runs.map((r) => [r.kind ?? 'text', r.text])).toEqual([
      ['box', '$$<b>x</b>$$'],
      ['text', ' & y'],
    ]);
  });

  it('gives a section title the AST id of the section that holds its tasks', () => {
    const { layout } = lay(
      parsed(
        'gantt\ndateFormat YYYY-MM-DD\nsection A\nsection B\nb :b, 2024-01-01, 1d\nsection A\na :a, 2024-01-01, 1d'
      )
    );
    expect(layout.sections.map((s) => [s.section, s.ast])).toEqual([
      ['B', 's:B'],
      ['A', 's:A@2'],
    ]);
  });
});
