import { beforeAll, describe, expect, it } from 'vitest';
import type { Warning } from '@mermaid-js/core';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import { cellMeasurer } from '@mermaid-js/core/ascii';
import { cellProfile, pxProfile } from '@mermaid-js/core/layout';
import { createTheme, loadTheme, type ThemeSpec } from '@mermaid-js/core/theme';
import { tableMeasurer } from '@mermaid-js/core/text';
import { board, card, column, FIXTURES, gridMeasurer } from './fixtures.ts';
import {
  kanbanLayoutViolations,
  layoutKanban,
  type KanbanLayout,
  type KanbanLayoutInput,
} from './index.ts';

let spec: ThemeSpec;
beforeAll(async () => {
  spec = await loadTheme('default');
});

function lay(
  input: KanbanLayoutInput,
  kanban: Record<string, unknown> = {},
  warnings: Warning[] = []
): KanbanLayout {
  return layoutKanban(input, {
    config: { kanban } as ResolvedConfig,
    measurer: gridMeasurer,
    units: pxProfile,
    theme: createTheme(spec),
    warn: (w) => warnings.push(w),
  });
}

// One mermaid@12.2.0 render (Chromium, default config, 16 px trebuchet: a line is 24 px) of a
// board with two columns: `Todo`, holding `a[Card one]`, then
// `b[Card two]@{ ticket: MC-1, assigned: knsv, priority: 'High' }`, then a card titled on three
// lines; and an empty `Done`. It gave columns at x 100 and 305 (200 wide, top −300, heights 237
// and 50), card boxes 185 wide centred at (200, −253), (200, −198) and (200, −119) with heights
// 44, 56 and 92, the titles 10 px in from the left at 4 px (card b) below the card top, ticket
// and assignee 24 px under the title, the assignee 10 px in from the right, and the priority bar
// from top + 2 to bottom − 2. The 24 px lines are what `gridMeasurer` measures.
describe('kanban layout: v12 geometry at default config', () => {
  const input = board(
    column(
      'Todo',
      'Todo',
      card('a', 'Card one'),
      card('b', 'Card two', { ticket: 'MC-1', assigned: 'knsv', priority: 'High' }),
      card('c', 'one<br>two<br>three')
    ),
    column('Done')
  );

  it('gives a card without metadata the height of its title plus 20 (no metadata row)', () => {
    const { cards } = lay(input);
    expect(cards.map((c) => [c.x, c.y, c.width, c.height])).toEqual([
      [107.5, -275, 185, 44],
      [107.5, -226, 185, 56],
      [107.5, -165, 185, 92],
    ]);
  });
});

describe('kanban layout: v12 label and column geometry', () => {
  const input = board(
    column(
      'Todo',
      'Todo',
      card('a', 'Card one'),
      card('b', 'Card two', { ticket: 'MC-1', assigned: 'knsv', priority: 'High' }),
      card('c', 'one<br>two<br>three')
    ),
    column('Done')
  );

  it('places columns W + 5 apart at v12 x, top −1.5 W, each its own height', () => {
    const { columns } = lay(input);
    expect(columns.map((c) => [c.x, c.y, c.width, c.height, c.slot])).toEqual([
      [100, -300, 200, 237, 1],
      [305, -300, 200, 50, 2],
    ]);
  });

  it('centres each column title at the column top', () => {
    const [todo, done] = lay(input).columns;
    // 'Todo' and 'Done' are 4 × 8 = 32 wide.
    expect([todo!.title!.x, todo!.title!.y, done!.title!.x]).toEqual([184, -300, 389]);
  });

  it('puts the title 10 − a/2 below the card top, the ticket under it, the assignee right', () => {
    const b = lay(input).cards[1]!;
    expect([b.title!.x, b.title!.y]).toEqual([117.5, -222]);
    expect([b.ticket!.x, b.ticket!.y]).toEqual([117.5, -198]);
    // 'knsv' is 32 wide; its right edge is 10 in from the card's.
    expect([b.assignee!.x + b.assignee!.width, b.assignee!.y]).toEqual([282.5, -198]);
  });

  it('draws the priority bar 2 in from the left, top and bottom, 4 wide', () => {
    const [a, b, c] = lay(input).cards;
    expect(b!.bar).toEqual({ x: 109.5, y1: -224, y2: -172, width: 4, priority: 'High' });
    expect(a!.bar).toBeUndefined();
    expect(c!.bar).toBeUndefined();
  });

  it('draws a bar only for the four v12 priorities, matched exactly (D375)', () => {
    const priorities = ['Very High', 'High', 'Low', 'Very Low', 'Medium', 'high', 'Urgent', ''];
    const { cards } = lay(
      board(column('a', 'A', ...priorities.map((p, i) => card(`c${i}`, 'x', { priority: p }))))
    );
    expect(cards.map((c) => c.bar?.priority)).toEqual([
      'Very High',
      'High',
      'Low',
      'Very Low',
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });

  it('bounds what is drawn, kanban.padding (8) around it, outlines included', () => {
    // v12's viewBox was `90 −310 425 257` with its 10 px margin and no outline.
    expect(lay(input).bounds).toEqual({ x: 91.5, y: -308.5, width: 422, height: 254 });
    expect(lay(input, { padding: 10 }).bounds).toEqual({
      x: 89.5,
      y: -310.5,
      width: 426,
      height: 258,
    });
  });
});

// A second 12.2.0 render, `sectionWidth: 0`, a column title on three lines (72 px), one card
// under it and one under a short title, and an empty column: every column took the 72 px
// title row (heights 126, 126 and 97), both cards' tops sat at −300 + 72, and W was 200.
describe('kanban layout: the shared title row', () => {
  const input = board(
    column('a', 'Short', card('c1', 'Card')),
    column('b', 'one<br>two<br>three', card('c2', 'Card')),
    column('e', 'Empty')
  );

  it('is the tallest title, shared by every column', () => {
    const layout = lay(input, { sectionWidth: 0 });
    expect(layout.titleRow).toBe(72);
    expect(layout.columns.map((c) => c.height)).toEqual([126, 126, 97]);
    expect(layout.cards.map((c) => c.y)).toEqual([-228, -228]);
    expect(layout.sectionWidth).toBe(200);
  });

  it('is 25 high when every title is shorter', () => {
    const layout = lay(board(column('a', 'A'), column('b', '')));
    expect(layout.titleRow).toBe(25);
    expect(layout.columns.map((c) => c.height)).toEqual([50, 50]);
    expect(layout.columns[1]!.title).toBeUndefined();
  });
});

describe('kanban layout: font', () => {
  it('carries the font it measured in, for the renderer to draw in (pitfall 16)', () => {
    const theme = createTheme(spec);
    expect(lay(board()).font).toEqual({
      family: theme.value('fontFamily'),
      size: theme.number('fontSize'),
      weight: 400,
    });
  });
});

describe('kanban layout: config', () => {
  it('takes kanban.sectionWidth as W, wrapping card titles at W − 25', () => {
    const title = 'aaaa bbbb cccc dddd eeee ffff gggg hhhh';
    const narrow = lay(board(column('a', 'A', card('x', title))), { sectionWidth: 100 });
    const wide = lay(board(column('a', 'A', card('x', title))), { sectionWidth: 300 });
    expect(narrow.cards[0]!.width).toBe(85);
    // 75 px wrap: 'aaaa bbbb' is 72 wide.
    expect(narrow.cards[0]!.title!.text.lines.length).toBe(4);
    expect(wide.cards[0]!.title!.text.lines.length).toBe(2);
    expect(wide.columns[0]!.x).toBe(150);
  });

  it('warns once per refused length and lays out with the default', () => {
    const warnings: Warning[] = [];
    const layout = lay(board(column('a')), { sectionWidth: -1, padding: 'wide' }, warnings);
    expect(layout.sectionWidth).toBe(200);
    expect(layout.bounds.x).toBe(layout.columns[0]!.x - 0.5 - 8);
    expect(warnings.map((w) => [w.code, w.path])).toEqual([
      ['KANBAN_CONFIG_IGNORED', 'kanban.sectionWidth'],
      ['KANBAN_CONFIG_IGNORED', 'kanban.padding'],
    ]);
  });

  it('raises a sectionWidth too narrow for its cards to the least width, with a warning', () => {
    for (const sectionWidth of [1, 10, 25.5]) {
      const warnings: Warning[] = [];
      const layout = lay(board(column('a', 'A', card('x', 'a b'))), { sectionWidth }, warnings);
      expect(layout.sectionWidth).toBe(26);
      // W − 15 wide, its title wrapped at W − 25 = 1: one word a line.
      expect(layout.cards[0]!.width).toBe(11);
      expect(layout.cards[0]!.title!.text.lines.length).toBe(2);
      expect(warnings.map((w) => [w.code, w.path])).toEqual([
        ['KANBAN_CONFIG_IGNORED', 'kanban.sectionWidth'],
      ]);
    }
    expect(lay(board(column('a')), { sectionWidth: 26 }).sectionWidth).toBe(26);
  });

  it('takes a numeric string as v12 did, and sectionWidth 0 as 200 with no warning', () => {
    const warnings: Warning[] = [];
    expect(lay(board(column('a')), { sectionWidth: '300' }, warnings).sectionWidth).toBe(300);
    expect(lay(board(column('a')), { sectionWidth: 0 }, warnings).sectionWidth).toBe(200);
    expect(warnings).toEqual([]);
  });
});

describe('kanban layout invariants', () => {
  for (const [name, { input, config }] of Object.entries(FIXTURES))
    for (const [variant, extra] of [
      ['fixture config', {}],
      ['sectionWidth 80, padding 0', { sectionWidth: 80, padding: 0 }],
      ['sectionWidth 10 (raised to the least)', { sectionWidth: 10 }],
    ] as const)
      it(`${name}, ${variant}`, () => {
        const layout = lay(input, { ...config, ...extra });
        expect(kanbanLayoutViolations(input, layout)).toEqual([]);
      });

  it('in the theme font measured by the table measurer, every fixture holds them too', () => {
    for (const { input, config } of Object.values(FIXTURES)) {
      const layout = layoutKanban(input, {
        config: { kanban: config ?? {} } as ResolvedConfig,
        measurer: tableMeasurer,
        units: pxProfile,
        theme: createTheme(spec),
        warn: () => {},
      });
      expect(kanbanLayoutViolations(input, layout)).toEqual([]);
    }
  });

  it('catches what it checks', () => {
    const input = FIXTURES['10-full-example']!.input;
    const good = lay(input);
    const [first, second] = good.cards;
    const moved: KanbanLayout = {
      ...good,
      cards: [{ ...first!, x: first!.x - 50 }, { ...second!, y: first!.y }, ...good.cards.slice(2)],
      bounds: { ...good.bounds, height: 1 },
    };
    const found = kanbanLayoutViolations(input, moved);
    expect(found.some((v) => v.includes('is outside its column'))).toBe(true);
    expect(found.some((v) => v.includes('overlaps'))).toBe(true);
    expect(found.some((v) => v.startsWith('the bounds do not hold'))).toBe(true);
    expect(kanbanLayoutViolations(input, { ...good, titleRow: NaN })).toEqual([
      'layout.titleRow is NaN',
    ]);
  });
});

describe('kanban layout in cells', () => {
  it('converts every length through the unit profile, and holds the invariants', () => {
    for (const { input, config } of Object.values(FIXTURES)) {
      const layout = layoutKanban(input, {
        config: { kanban: config ?? {} } as ResolvedConfig,
        measurer: cellMeasurer,
        units: cellProfile(),
        theme: createTheme(spec),
        warn: () => {},
      });
      expect(layout.units).toBe('cell');
      expect(kanbanLayoutViolations(input, layout)).toEqual([]);
    }
    const { sectionWidth, radius } = layoutKanban(board(column('a')), {
      config: {} as ResolvedConfig,
      measurer: cellMeasurer,
      units: cellProfile(),
      theme: createTheme(spec),
      warn: () => {},
    });
    // 200 px and 5 px at 8 px a cell.
    expect([sectionWidth, radius]).toEqual([25, 1]);
    // The least W in cells still leaves card labels a cell to wrap at.
    const narrow = layoutKanban(board(column('a', 'A', card('x'))), {
      config: { kanban: { sectionWidth: 26 } } as unknown as ResolvedConfig,
      measurer: cellMeasurer,
      units: cellProfile(),
      theme: createTheme(spec),
      warn: () => {},
    });
    expect(narrow.sectionWidth - narrow.cards[0]!.width).toBe(2);
    expect(narrow.sectionWidth).toBe(4);
  });
});
