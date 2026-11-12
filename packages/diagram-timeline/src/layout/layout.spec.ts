import type { DiagramPlugin } from '@mermaid-js/core';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import { tableMeasurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, type ThemeSpec } from '@mermaid-js/core/theme';
import type { TimelineModel } from '../model.ts';
import * as fx from './fixtures.ts';
import { layoutTimeline, timelineLayoutViolations, type TimelineLayout } from './index.ts';
import { timeline as diagramPlugin } from '../plugin.ts';

/** The diagram's own theme table (D331), passed to `createTheme` as the pipeline does. */
const { theme: diagramTheme }: Pick<DiagramPlugin, 'id' | 'theme'> = diagramPlugin;

// Classic and redux differ in the label font weight the boxes are measured in.
const THEMES = ['default', 'redux'] as const;
type ThemeName = (typeof THEMES)[number];
const specs = new Map<ThemeName, ThemeSpec>();
beforeAll(async () => {
  for (const name of THEMES) specs.set(name, await loadTheme(name));
});

function lay(
  model: TimelineModel,
  timeline: Record<string, unknown> = {},
  theme: ThemeName = 'default',
  themeVariables: Record<string, unknown> = {}
): TimelineLayout {
  return layoutTimeline(model, {
    config: { timeline } as ResolvedConfig,
    measurer: tableMeasurer,
    theme: createTheme(specs.get(theme)!, { diagram: diagramTheme, themeVariables }),
  });
}

describe('timeline LR follows timelineRenderer.ts', () => {
  it('puts one 190 px column every 200 px from 50 + leftMargin, events 200 px below the period top', () => {
    const l = lay(fx.simple);
    expect(l.direction).toBe('LR');
    expect(l.periods.map((p) => [p.x, p.y, p.width])).toEqual([
      [200, 50, 190],
      [400, 50, 190],
      [600, 50, 190],
      [800, 50, 190],
    ]);
    const [, second] = l.periods;
    expect(second!.events.map((e) => [e.x, e.width])).toEqual([
      [400, 190],
      [400, 190],
    ]);
    expect(second!.events[0]!.y).toBe(250);
    // Events are at least 50 tall, 10 apart.
    expect(second!.events[0]!.height).toBe(50);
    expect(second!.events[1]!.y).toBe(310);
  });

  it('draws the axis 50 px below the periods, from leftMargin to the content width + 3 × leftMargin', () => {
    const l = lay(fx.simple);
    const [p] = l.periods;
    const { axis } = l;
    expect(axis.y1).toBe(axis.y2);
    expect(axis.y1).toBeCloseTo(p!.y + p!.height + 50);
    // Content 200…990 is 790 wide.
    expect([axis.x1, axis.x2, axis.width]).toEqual([150, 790 + 450, 4]);
    // v12's marker (M0,0 V4 L6,2, refX 5, refY 2) in stroke widths: tip 4 px past the end.
    expect(axis.arrow.tip).toEqual({ x: 1244, y: axis.y1 });
    expect(axis.arrow.left).toEqual({ x: 1220, y: axis.y1 - 8 });
  });

  it('gives every period the height of the tallest plus 20, and every column one connector length', () => {
    const l = lay(fx.columns);
    const heights = new Set(l.periods.map((p) => p.height));
    expect(heights.size).toBe(1);
    const p = l.periods[0]!;
    expect(p.height).toBeCloseTo(p.label.height + 16 * 0.55 + 20 + 20);
    // Connectors start at the period's bottom, in its middle, and all end at one depth.
    expect(new Set(l.connectors.map((c) => c.y2)).size).toBe(1);
    for (const c of l.connectors) {
      const q = l.periods[c.period]!;
      expect([c.x1, c.y1, c.width]).toEqual([q.x + 95, q.y + q.height, 2]);
    }
    // The longest stack (Research and Development, six events) sets the length.
    const longest = l.periods[3]!;
    expect(longest.events).toHaveLength(6);
    expect(l.connectors[0]!.y2).toBeGreaterThan(longest.events.at(-1)!.y);
  });

  it('draws section boxes 200·n − 10 wide over their columns, and periods 50 below them', () => {
    const l = lay(fx.sections);
    expect(l.sections.map((s) => [s.x, s.y, s.width])).toEqual([
      [200, 50, 590],
      [800, 50, 390],
    ]);
    const [first] = l.sections;
    expect(l.periods[0]!.y).toBeCloseTo(50 + first!.height + 50);
    expect(first!.height).toBeCloseTo(first!.label.height + 16 * 0.55 + 20 + 20);
  });

  it('starts events no higher than 50 below the axis for a tall period (D252)', () => {
    const l = lay(fx.tallPeriod);
    const [tall] = l.periods;
    expect(tall!.height).toBeGreaterThan(150);
    // v12 put them at the period top + 200, over the axis.
    expect(tall!.events[0]!.y).toBeCloseTo(l.axis.y1 + 50);
    expect(tall!.events[0]!.y).toBeGreaterThan(tall!.y + 200);
    // The connectors move down with them.
    // v12's length: the period height and the longest stack of event heights (no 50 floor).
    const stack = tall!.events.reduce((sum, e) => sum + e.label.height + 16 * 0.55 + 20, 10);
    expect(l.connectors[0]!.y2 - tall!.events[0]!.y).toBeCloseTo(tall!.height + stack);
  });

  it('keeps v12 event positions for normal periods (D252)', () => {
    for (const m of [fx.simple, fx.sections, fx.space, fx.stacked]) {
      const l = lay(m);
      for (const p of l.periods) if (p.events[0]) expect(p.events[0].y).toBe(p.y + 200);
    }
  });

  it('places the title at content width / 2 − leftMargin, baseline 20, bold 4ex (D254)', () => {
    const l = lay(fx.simple);
    const t = l.title!;
    expect(t.x).toBe(790 / 2 - 150);
    expect(t.y + t.text.baseline).toBe(20);
    expect(t.text.lines[0]!.map((r) => r.text).join('')).toBe('History of Social Media Platform');
    // 4ex of a 16 px font is 32 px: the title line is twice a box line.
    expect(t.text.lineHeight).toBeCloseTo(2 * l.periods[0]!.label.lineHeight);
    expect(lay(fx.leading).title).toBeUndefined();
  });

  it('keeps v12 viewBox where nothing reaches past the padding (D224)', () => {
    const l = lay(fx.simple);
    // getBBox: from the axis start (150) to its end (1240); from the title top to the
    // connectors' end; 50 around.
    expect(l.bounds.x).toBe(100);
    expect(l.bounds.width).toBe(1240 - 150 + 100);
    expect(l.bounds.y).toBeCloseTo(l.title!.y - 50);
    expect(l.bounds.y + l.bounds.height).toBeCloseTo(l.connectors[0]!.y2 + 50);
  });

  it('grows the viewBox to the arrowhead with no padding (D224)', () => {
    const l = lay(fx.simple, { padding: 0 });
    expect(l.bounds.x + l.bounds.width).toBe(l.axis.arrow.tip.x);
  });

  it('reaches the last column with a small leftMargin', () => {
    const l = lay(fx.simple, { leftMargin: 0 });
    const last = l.periods.at(-1)!;
    expect(l.axis.x1).toBe(0);
    expect(l.axis.x2).toBe(last.x + last.width);
  });

  it('reads leftMargin: the content starts 50 + leftMargin in', () => {
    expect(lay(fx.simple, { leftMargin: 100 }).periods[0]!.x).toBe(150);
  });
});

describe('timeline title', () => {
  it('moves the content down by what a taller title adds over one line (D225)', () => {
    for (const m of [fx.brTitle, fx.turned(fx.brTitle)]) {
      const l = lay(m);
      const one = lay({ ...m, title: 'A title' });
      const t = l.title!;
      expect(t.text.lines).toHaveLength(3);
      const shift = t.text.height - t.text.lineHeight;
      expect(l.sections[0]!.y).toBeCloseTo(one.sections[0]!.y + shift);
      expect(l.periods[0]!.y).toBeCloseTo(one.periods[0]!.y + shift);
      // The one-line title keeps v12's origin.
      expect(one.sections[0]!.y).toBe(50);
    }
  });

  it('moves the content down by what a large font size adds to the title', () => {
    const at = (fontSize: string): TimelineLayout =>
      lay(fx.verticalSimple, {}, 'default', { fontSize });
    const big = at('72px');
    const t = big.title!;
    // The title's bottom sits as far above the content as v12's one-line 16 px title does.
    const ref = at('16px');
    const gap = ref.periods[0]!.y - (ref.title!.y + ref.title!.height);
    expect(big.periods[0]!.y - (t.y + t.height)).toBeCloseTo(gap);
    expect(big.periods[0]!.y).toBeGreaterThan(50);
  });
});

describe('timeline groups and colour slots', () => {
  it('gives each period its own slot without sections, or slot 0 under disableMulticolor', () => {
    expect(lay(fx.seven).periods.map((p) => p.slot)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    const flat = lay(fx.seven, { disableMulticolor: true });
    expect(flat.periods.map((p) => p.slot)).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(lay(fx.simple).periods[1]!.events.map((e) => e.slot)).toEqual([1, 1]);
    expect(lay(fx.simple).connectors.map((c) => c.slot)).toEqual([0, 1, 2, 3]);
  });

  it("gives a period and its events their section's ordinal; disableMulticolor changes nothing then", () => {
    for (const timeline of [{}, { disableMulticolor: true }]) {
      const l = lay(fx.space, timeline);
      expect(l.sections.map((s) => s.slot)).toEqual([0, 1, 2]);
      expect(l.periods.map((p) => p.slot)).toEqual([0, 0, 1, 1, 2, 2, 2]);
      expect(l.periods[2]!.events.map((e) => e.slot)).toEqual([1, 1]);
    }
  });

  it('draws periods before the first section first, with no box, in slot 0 (D251)', () => {
    for (const m of [fx.leading, fx.turned(fx.leading)]) {
      const l = lay(m);
      expect(l.periods.map((p) => [p.ast, p.slot])).toEqual([
        ['per:1', 0],
        ['per:2', 0],
        ['per:3', 0],
        ['per:4', 2],
      ]);
      // Each section draws once, a repeated name too, and an empty one takes a column or row.
      expect(l.sections.map((s) => s.ast)).toEqual(['sec:1', 'sec:2', 'sec:3']);
    }
    const lr = lay(fx.leading);
    expect(lr.periods.map((p) => p.x)).toEqual([200, 400, 600, 1000]);
    expect(lr.sections.map((s) => [s.x, s.width])).toEqual([
      [600, 190],
      [800, 190],
      [1000, 190],
    ]);
    // A period with no events still gets its connector (v12).
    expect(lr.connectors).toHaveLength(4);
  });
});

describe('timeline TD follows timelineRendererVertical.ts', () => {
  it('puts periods 20 left of the axis and events 50 right of it, with a connector each', () => {
    const l = lay(fx.verticalSimple);
    expect(l.direction).toBe('TD');
    // masterX 200; the axis at 200 + 210 + 20.
    expect([l.axis.x1, l.axis.x2]).toEqual([430, 430]);
    for (const p of l.periods) {
      expect([p.x, p.width]).toEqual([200, 210]);
      for (const e of p.events) expect([e.x, e.width]).toEqual([480, 310]);
    }
    const second = l.periods[1]!;
    expect(second.events[1]!.y).toBeCloseTo(second.events[0]!.y + second.events[0]!.height + 10);
    expect(l.connectors).toHaveLength(5);
    const c = l.connectors[1]!;
    expect([c.x1, c.x2, c.y1, c.width]).toEqual([
      430,
      480,
      second.y + second.events[0]!.height / 2,
      2,
    ]);
  });

  it('gives every row the height of the tallest period or event stack, plus 30', () => {
    const l = lay(fx.verticalSimple);
    const second = l.periods[1]!;
    const stack = bottomOf(second.events.at(-1)!) - second.y;
    const pitch = l.periods[2]!.y - l.periods[1]!.y;
    expect(pitch).toBeCloseTo(stack + 30);
    expect(l.periods[0]!.y).toBe(50);
    expect(l.periods[0]!.height).toBeCloseTo(l.periods[0]!.label.height + 16 * 0.55 + 5);
  });

  it('runs the axis from 2 font sizes above the content to 0.5 font size + 20 below it, with an arrowhead (D253)', () => {
    const l = lay({ ...fx.verticalSimple, title: undefined });
    const last = l.periods.at(-1)!;
    const end = Math.max(bottomOf(last), bottomOf(last.events.at(-1)!));
    expect(l.axis.y1).toBe(50 - 32);
    expect(l.axis.y2).toBeCloseTo(end + 8 + 20);
    expect(l.axis.arrow.tip).toEqual({ x: 430, y: l.axis.y2 + 4 });
    // v12 reads the top-level `fontSize` key here (`parseFontSize(conf.fontSize)`), not the
    // theme's font size.
    const big = layoutTimeline(
      { ...fx.verticalSimple, title: undefined },
      {
        config: { timeline: {}, fontSize: 20 } as ResolvedConfig,
        measurer: tableMeasurer,
        theme: createTheme(specs.get('default')!, { diagram: diagramTheme }),
      }
    );
    expect(big.axis.y1).toBe(50 - 40);
    const themed = lay({ ...fx.verticalSimple, title: undefined }, {}, 'default', {
      fontSize: '20px',
    });
    expect(themed.axis.y1).toBe(50 - 32);
  });

  it('starts the axis below a title it would cross, where v12 drew it through', () => {
    const l = lay(fx.verticalSimple);
    const t = l.title!;
    expect(t.x).toBeLessThan(430);
    expect(t.x + t.width).toBeGreaterThan(430);
    expect(l.axis.y1).toBeCloseTo(t.y + t.height);
    expect(l.axis.y1).toBeGreaterThan(50 - 32);
    // The boxes keep v12's places.
    expect(l.periods[0]!.y).toBe(50);
  });

  it('draws sections as full rows, 590 wide, with their periods 20 below', () => {
    const l = lay(fx.verticalSections);
    expect(l.sections.map((s) => [s.x, s.width])).toEqual([
      [200, 590],
      [200, 590],
    ]);
    const [first] = l.sections;
    expect(l.periods[0]!.y).toBeCloseTo(first!.y + first!.height + 20);
  });

  it('starts a section 30 below the last row of the one before, where v12 overlapped them', () => {
    const l = lay(fx.verticalFullRows);
    const [, second] = l.sections;
    const row = l.periods[0]!;
    expect(second!.y).toBeCloseTo(bottomOf(row.events.at(-1)!) + 30);
    // v12: the rows' top + one pitch − 60, 30 above that row's end.
    const pitch = l.periods[2]!.y - l.periods[1]!.y;
    expect(second!.y).toBeGreaterThan(row.y + pitch - 60);
  });

  it('places the title by the same formula as LR (D254)', () => {
    const l = lay(fx.verticalSimple);
    // Content 200…790.
    expect(l.title!.x).toBe(590 / 2 - 150);
    expect(l.title!.y + l.title!.text.baseline).toBe(20);
  });
});

describe('timeline line widths follow the theme', () => {
  it('draws the axis at 4 px and connectors at 2 px where boxes take cScale (v12 classic)', () => {
    for (const m of [fx.simple, fx.turned(fx.simple)]) {
      const l = lay(m);
      expect(l.axis.width).toBe(4);
      expect(new Set(l.connectors.map((c) => c.width))).toEqual(new Set([2]));
    }
  });

  it('draws both at strokeWidth in the redux themes, arrowheads sized to match', () => {
    for (const m of [fx.simple, fx.turned(fx.simple)]) {
      const l = lay(m, {}, 'redux', { strokeWidth: 3 });
      expect(l.axis.width).toBe(3);
      expect(new Set(l.connectors.map((c) => c.width))).toEqual(new Set([3]));
      // The tip is one stroke width past the line's end.
      const { axis } = l;
      expect(Math.hypot(axis.arrow.tip.x - axis.x2, axis.arrow.tip.y - axis.y2)).toBeCloseTo(3);
    }
  });
});

describe('timeline bounds hold every stroke (D224)', () => {
  const edges = (l: TimelineLayout) => {
    const boxes = [...l.sections, ...l.periods, ...l.periods.flatMap((p) => p.events)];
    return {
      left: Math.min(...boxes.map((b) => b.x)),
      top: Math.min(...boxes.map((b) => b.y)),
      right: Math.max(...boxes.map((b) => b.x + b.width)),
      bottom: Math.max(...boxes.map((b) => b.y + b.height)),
    };
  };
  it('holds half the redux outline around every box, with no padding', () => {
    for (const m of [fx.sections, fx.turned(fx.sections), fx.turned(fx.simple)]) {
      const l = lay(m, { padding: 0 }, 'redux', { strokeWidth: 6 });
      const e = edges(l);
      const b = l.bounds;
      expect(b.x).toBeLessThanOrEqual(e.left - 3);
      expect(b.y).toBeLessThanOrEqual(e.top - 3);
      expect(b.x + b.width).toBeGreaterThanOrEqual(e.right + 3);
      expect(b.y + b.height).toBeGreaterThanOrEqual(e.bottom + 3);
    }
  });

  it('holds half the 3 px rule under the lowest classic box', () => {
    const l = lay(fx.turned(fx.simple), { padding: 0 });
    expect(l.bounds.y + l.bounds.height).toBeGreaterThanOrEqual(edges(l).bottom + 1.5);
  });
});

describe('timeline long words stay whole and widen only their box (#649)', () => {
  const lines = (b: { label: { lines: readonly { text: string }[][] } }): string[] =>
    b.label.lines.map((l) => l.map((r) => r.text).join(''));

  it('LR: widens the column of a long period or event and a long section, nothing else', () => {
    const l = lay(fx.wholeWords);
    const [one, event, period, sectioned] = l.periods;
    const ev = event!.events[0]!;
    expect(lines(ev)).toEqual([fx.WHOLE_WORD]);
    expect(lines(period!)).toEqual([fx.WHOLE_WORD]);
    expect(lines(l.sections[0]!)).toEqual([fx.WHOLE_WORD]);
    // A column of short words keeps v12's 190 px at x 200.
    expect([one!.x, one!.width]).toEqual([200, 190]);
    expect(one!.events[0]!.width).toBe(190);
    // A long word's column is the word plus the 20 px padding a side, its events with it.
    expect(event!.width).toBeCloseTo(ev.label.width + 40);
    expect(ev.width).toBe(event!.width);
    expect(period!.width).toBeCloseTo(period!.label.width + 40);
    // Columns stay 10 px apart.
    expect(event!.x).toBe(400);
    expect(period!.x).toBeCloseTo(event!.x + event!.width + 10);
    expect(sectioned!.x).toBeCloseTo(period!.x + period!.width + 10);
    // A section wider than its column widens the column, and the box covers the word.
    const s = l.sections[0]!;
    expect(s.width).toBeCloseTo(s.label.width + 40);
    expect(s.x).toBe(sectioned!.x);
    expect(s.width).toBeCloseTo(sectioned!.width);
    expect(timelineLayoutViolations(fx.wholeWords, l)).toEqual([]);
  });

  it('TD: widens a long period to the left and a long event to the right; the axis stays', () => {
    const m = fx.turned(fx.wholeWords);
    const l = lay(m);
    const [one, event, period] = l.periods;
    const ev = event!.events[0]!;
    expect(lines(ev)).toEqual([fx.WHOLE_WORD]);
    expect(lines(period!)).toEqual([fx.WHOLE_WORD]);
    expect([l.axis.x1, l.axis.x2]).toEqual([430, 430]);
    expect([one!.x, one!.width]).toEqual([200, 210]);
    expect([one!.events[0]!.x, one!.events[0]!.width]).toEqual([480, 310]);
    expect(period!.width).toBeCloseTo(Math.max(210, period!.label.width + 10));
    expect(period!.x + period!.width).toBe(410);
    expect(ev.x).toBe(480);
    expect(ev.width).toBeCloseTo(Math.max(310, ev.label.width + 10));
    expect(timelineLayoutViolations(m, l)).toEqual([]);
  });

  it('lays out a diagram without long words as before', () => {
    const l = lay(fx.sections);
    expect(l.sections.map((s) => [s.x, s.width])).toEqual([
      [200, 590],
      [800, 390],
    ]);
  });
});

describe('timelineLayoutViolations', () => {
  it('catches a broken layout', () => {
    const good = lay(fx.sections);
    const [p0, p1, p2] = good.periods;
    const broken: TimelineLayout = {
      ...good,
      periods: [
        p0!,
        { ...p1!, x: p0!.x + 10, events: [{ ...p1!.events[0]!, x: 0 }] },
        { ...p2!, height: NaN },
        ...good.periods.slice(3),
      ],
      sections: [{ ...good.sections[0]!, width: 10 }, ...good.sections.slice(1)],
      axis: { ...good.axis, x2: 300 },
    };
    const found = timelineLayoutViolations(fx.sections, broken);
    expect(found).toContain('layout.periods[2].height is NaN');
    expect(
      found.some((v) => v.startsWith('period per:1 ') && v.includes(' overlaps period per:2 '))
    ).toBe(true);
    expect(found).toContain('event ev:2.1 is out of the column of period per:2');
    expect(found).toContain('section sec:1 does not span period per:2');
    expect(found.some((v) => v.startsWith('the axis (150…300) does not span'))).toBe(true);
  });

  it('catches a line through the title, a wrong slot and a label wider than its box', () => {
    const good = lay(fx.verticalSimple);
    const [p0] = good.periods;
    const broken: TimelineLayout = {
      ...good,
      axis: { ...good.axis, y1: -100 },
      periods: [{ ...p0!, slot: 3, width: 20 }, ...good.periods.slice(1)],
    };
    const found = timelineLayoutViolations(fx.verticalSimple, broken);
    expect(found).toContain('the axis crosses the title');
    expect(found).toContain('period per:1 is in slot 3, not 0');
    expect(found).toContain("event ev:1.1 is in slot 0, not its period's");
    expect(found).toContain('the label of per:1 is wider than its box');
    // With disableMulticolor every period is in slot 0.
    const multi = lay(fx.seven);
    expect(timelineLayoutViolations(fx.seven, multi, { disableMulticolor: true })).toContain(
      'period per:2 is in slot 1, not 0'
    );
  });

  it('catches overlapping TD sections and a model mismatch', () => {
    const good = lay(fx.verticalFullRows);
    const [, second] = good.sections;
    const moved = { ...second!, y: second!.y - 60 };
    const broken: TimelineLayout = {
      ...good,
      sections: [good.sections[0]!, moved, ...good.sections.slice(2)],
    };
    const found = timelineLayoutViolations(fx.verticalFullRows, broken);
    expect(
      found.some((v) => v.startsWith(fmtRect(moved)) && v.includes(' overlaps event ev:1.4 '))
    ).toBe(true);
    const short = { ...good, periods: good.periods.slice(1) };
    expect(timelineLayoutViolations(fx.verticalFullRows, short)).toContain(
      '3 periods laid out, the model has 4'
    );
  });
});

const fmtRect = (r: { x: number; y: number; width: number; height: number }): string =>
  `section sec:2 (${r.x}, ${r.y}, ${r.width} × ${r.height})`;
const bottomOf = (r: { y: number; height: number }): number => r.y + r.height;

// Every option the layout reads, set away from its default.
const VARIANT = { leftMargin: 10, padding: 0, disableMulticolor: true } as const;

describe('timeline layout invariants', () => {
  for (const theme of THEMES)
    for (const [config, timeline] of [
      ['default config', {}],
      ['every option changed', VARIANT],
    ] as const)
      for (const [name, model] of Object.entries(fx.FIXTURES))
        for (const m of [model, fx.turned(model)])
          it(`${name}, ${m.direction}, ${theme}, ${config}`, () => {
            expect(timelineLayoutViolations(m, lay(m, timeline, theme), timeline)).toEqual([]);
          });

  it.each(['30px', '72px'])('hold at a font size of %s', (fontSize) => {
    for (const [name, model] of Object.entries(fx.FIXTURES))
      for (const m of [model, fx.turned(model)])
        expect(
          timelineLayoutViolations(m, lay(m, {}, 'default', { fontSize })),
          `${name} ${m.direction}`
        ).toEqual([]);
  });
});
