import { beforeAll, describe, expect, it } from 'vitest';
import type { Warning } from '@mermaid-js/core';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import { cellMeasurer } from '@mermaid-js/core/ascii';
import { cellProfile, pxProfile } from '@mermaid-js/core/layout';
import { tableMeasurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, type ThemeSpec } from '@mermaid-js/core/theme';
import { EDGE_CASES, gridMeasurer, kanban, parsed } from './fixtures.ts';
import { layoutKanban, type KanbanLayout, type KanbanLayoutInput } from './index.ts';
import { kanbanLayoutViolations } from './invariants.ts';

/** The parsed layout input of a board. */
const board = (...lines: string[]): KanbanLayoutInput => parsed(kanban(...lines)).input;

let spec: ThemeSpec;
beforeAll(async () => {
  spec = await loadTheme('default');
});

function lay(
  input: KanbanLayoutInput,
  kanbanConfig: Record<string, unknown> = {},
  warnings: Warning[] = []
): KanbanLayout {
  return layoutKanban(input, {
    config: { kanban: kanbanConfig } as ResolvedConfig,
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
    '  Todo',
    '    a[Card one]',
    "    b[Card two]@{ ticket: MC-1, assigned: knsv, priority: 'High' }",
    '    c[one<br>two<br>three]',
    '  Done'
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
    '  Todo',
    '    a[Card one]',
    "    b[Card two]@{ ticket: MC-1, assigned: knsv, priority: 'High' }",
    '    c[one<br>two<br>three]',
    '  Done'
  );

  it('places columns W + 5 apart at v12 x, top −1.5 W, each its own height', () => {
    const { columns } = lay(input);
    expect(columns.map((c) => [c.x, c.y, c.width, c.height, c.ordinal])).toEqual([
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
    const priorities = [
      "'Very High'",
      "'High'",
      "'Low'",
      "'Very Low'",
      "'Medium'",
      "'high'",
      "'Urgent'",
      '1',
    ];
    const { cards } = lay(
      board('  a[A]', ...priorities.map((p, i) => `    c${i}[x]@{ priority: ${p} }`))
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
// title row (heights 126, 126 and 97), both cards' tops sat at −300 + 72, and W was 200. The row
// here is 73: 1 px more, the room the 25 px row leaves under a 24 px line (the title room).
describe('kanban layout: the shared title row', () => {
  const input = board(
    '  a[Short]',
    '    c1[Card]',
    '  b[one<br>two<br>three]',
    '    c2[Card]',
    '  e[Empty]'
  );

  it('is the tallest title, shared by every column', () => {
    const layout = lay(input, { sectionWidth: 0 });
    expect(layout.titleRow).toBe(73);
    expect(layout.columns.map((c) => c.height)).toEqual([127, 127, 98]);
    expect(layout.cards.map((c) => c.y)).toEqual([-227, -227]);
    expect(layout.sectionWidth).toBe(200);
  });

  it('is 25 high when every title is shorter', () => {
    const layout = lay(board('  a[A]', '  b[B]'));
    expect(layout.titleRow).toBe(25);
    expect(layout.columns.map((c) => c.height)).toEqual([50, 50]);
  });
});

// D647: a ticket and an assignee that do not fit side by side on one row are stacked, as the
// text output does. With `gridMeasurer` (8 px a character) the row is the card's 185 less 10 at
// each side: 165 px. Twenty characters (160 px) fit; twenty-one (168 px) do not.
describe('kanban layout: a ticket and an assignee that do not fit side by side (D647)', () => {
  const card = (ticket: string, assigned: string) =>
    lay(board('  a[Todo]', `    x[Card]@{ ticket: '${ticket}', assigned: '${assigned}' }`))
      .cards[0]!;

  it('keeps a pair that fits on one row, at v12 geometry', () => {
    // 'MC-1234567' and 'Dana Smith' are 10 characters each: 160 px of the 165.
    const c = card('MC-1234567', 'Dana Smith');
    // As card b of v12's render: 24 + 20 + 24 / 2 high, the title 10 − 24 / 4 below the top.
    expect(c.height).toBe(56);
    expect(c.title!.y - c.y).toBe(4);
    expect(c.ticket!.y).toBe(c.assignee!.y);
    expect(c.ticket!.x + c.ticket!.width).toBeLessThanOrEqual(c.assignee!.x);
  });

  it('stacks them when they fill the row: the assignee under the ticket, still right-aligned', () => {
    // One character more: 168 px.
    const c = card('MC-12345678', 'Dana Smith');
    expect(c.ticket!.x).toBe(c.x + 10);
    expect(c.assignee!.y).toBe(c.ticket!.y + c.ticket!.height);
    expect(c.assignee!.x + c.assignee!.width).toBe(c.x + c.width - 10);
    // Each a row of its own: the card grows by both, the title stays 10 below its top, and
    // the assignee ends 10 above its bottom.
    expect(c.title!.y - c.y).toBe(10);
    expect(c.height).toBe(24 + 20 + 24 + 24);
    expect(c.assignee!.y + c.assignee!.height).toBe(c.y + c.height - 10);
  });

  it("holds #774's card: both wrapped, on rows of their own, inside the card", () => {
    const input = board(
      '  long[Column]',
      "    a[Card]@{ assigned: 'A very long assignee name that goes on', ticket: 'VERY-LONG-TICKET-NUMBER-12345' }"
    );
    const layout = lay(input);
    const c = layout.cards[0]!;
    const { ticket, assignee } = c;
    expect(ticket!.text.lines.length).toBe(2);
    expect(assignee!.text.lines.length).toBe(2);
    expect(assignee!.y).toBe(ticket!.y + ticket!.height);
    for (const label of [ticket!, assignee!]) {
      expect(label.x).toBeGreaterThanOrEqual(c.x);
      expect(label.x + label.width).toBeLessThanOrEqual(c.x + c.width);
      expect(label.y + label.height).toBeLessThanOrEqual(c.y + c.height);
    }
    expect(kanbanLayoutViolations(input, layout)).toEqual([]);
    // The column grows with its card.
    expect(layout.columns[0]!.height).toBe(c.height + 5 + 30);
  });

  it('moves the next card down by what the card grew', () => {
    const input = board(
      '  a[Todo]',
      "    x[Card]@{ ticket: 'MC-12345678', assigned: 'Dana Smith' }",
      '    y[Next]'
    );
    const [x, y] = lay(input).cards;
    expect(y!.y).toBe(x!.y + x!.height + 5);
  });

  it('stacks in cells by the same rule', () => {
    const input = board(
      '  a[Todo]',
      "    x[Card]@{ ticket: 'MC-1234567890', assigned: 'Dana Smith' }"
    );
    const c = layoutKanban(input, {
      config: {} as ResolvedConfig,
      measurer: cellMeasurer,
      units: cellProfile(),
      theme: createTheme(spec),
      warn: () => {},
    }).cards[0]!;
    expect(c.assignee!.y).toBe(c.ticket!.y + c.ticket!.height);
  });
});

describe('kanban layout: font', () => {
  it('carries the font it measured in, for the renderer to draw in (pitfall 16)', () => {
    const theme = createTheme(spec);
    expect(lay(board('')).font).toEqual({
      family: theme.value('fontFamily'),
      size: theme.number('fontSize'),
      weight: 400,
    });
  });
});

describe('kanban layout: config', () => {
  it('takes kanban.sectionWidth as W, wrapping card titles at W − 25', () => {
    const title = 'aaaa bbbb cccc dddd eeee ffff gggg hhhh';
    const narrow = lay(board('  a[A]', `    x[${title}]`), { sectionWidth: 100 });
    const wide = lay(board('  a[A]', `    x[${title}]`), { sectionWidth: 300 });
    expect(narrow.cards[0]!.width).toBe(85);
    // 75 px wrap: 'aaaa bbbb' is 72 wide.
    expect(narrow.cards[0]!.title!.text.lines.length).toBe(4);
    expect(wide.cards[0]!.title!.text.lines.length).toBe(2);
    expect(wide.columns[0]!.x).toBe(150);
  });

  it('warns once per refused length and lays out with the default', () => {
    const warnings: Warning[] = [];
    const layout = lay(board('  a'), { sectionWidth: -1, padding: 'wide' }, warnings);
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
      const layout = lay(board('  a[A]', '    x[a b]'), { sectionWidth }, warnings);
      expect(layout.sectionWidth).toBe(26);
      // W − 15 wide, its title wrapped at W − 25 = 1: one word a line.
      expect(layout.cards[0]!.width).toBe(11);
      expect(layout.cards[0]!.title!.text.lines.length).toBe(2);
      expect(warnings.map((w) => [w.code, w.path])).toEqual([
        ['KANBAN_CONFIG_IGNORED', 'kanban.sectionWidth'],
      ]);
    }
    expect(lay(board('  a'), { sectionWidth: 26 }).sectionWidth).toBe(26);
  });

  it('takes a numeric string as v12 did, and sectionWidth 0 as 200 with no warning', () => {
    const warnings: Warning[] = [];
    expect(lay(board('  a'), { sectionWidth: '300' }, warnings).sectionWidth).toBe(300);
    expect(lay(board('  a'), { sectionWidth: 0 }, warnings).sectionWidth).toBe(200);
    expect(warnings).toEqual([]);
  });
});

// The spec (and v12, `clusters.js:346`) let a word wider than its wrap width overflow, unbroken;
// Pele's "words broken between characters" is a divergence not to follow. Core's `keepWords`
// keeps it whole in px; the text output, in cells, still splits it to keep it inside its box.
describe('kanban layout: a word wider than its wrap width', () => {
  const word = 'Supercalifragilisticexpialidociousandevenlongerwordhere';
  const input = board(`  e[${word}]`, `    c[${word}]@{ ticket: ${word}, assigned: ${word} }`);

  it('overflows whole in every label kind, as v12, and the bounds hold it', () => {
    const layout = lay(input);
    const column = layout.columns[0]!;
    const card = layout.cards[0]!;
    // 55 characters at 8 px.
    const wide = word.length * 8;
    for (const label of [column.title!, card.title!, card.ticket!, card.assignee!]) {
      expect(label.text.lines.map((l) => l.map((r) => r.text).join(''))).toEqual([word]);
      expect(label.width).toBe(wide);
    }
    // The column title is centred, so it sticks out on both sides; the card title and ticket
    // start 10 px in from the card's left edge, and the assignee ends 10 px in from its right.
    expect(column.title!.x).toBe(column.x + (column.width - wide) / 2);
    expect(card.title!.x).toBe(card.x + 10);
    expect(card.title!.x + wide).toBeGreaterThan(card.x + card.width);
    expect(card.assignee!.x + wide).toBe(card.x + card.width - 10);
    const b = layout.bounds;
    expect(b.x).toBeLessThanOrEqual(card.assignee!.x);
    expect(b.x + b.width).toBeGreaterThanOrEqual(card.title!.x + wide);
    expect(kanbanLayoutViolations(input, layout)).toEqual([]);
  });

  it('is split between characters in cells, so the text output keeps it in its box', () => {
    const layout = layoutKanban(input, {
      config: {} as ResolvedConfig,
      measurer: cellMeasurer,
      units: cellProfile(),
      theme: createTheme(spec),
      warn: () => {},
    });
    const card = layout.cards[0]!;
    expect(card.title!.text.lines.length).toBeGreaterThan(1);
    expect(card.title!.width).toBeLessThanOrEqual(layout.sectionWidth);
    expect(kanbanLayoutViolations(input, layout)).toEqual([]);
  });
});

// The corpus files and cases are swept by conformance's `src/kanban/layout-corpus.spec.ts`.
const CASES = Object.entries(EDGE_CASES).map(([name, src]) => [name, parsed(src)] as const);

describe('kanban layout invariants', () => {
  for (const [name, { input, config }] of CASES)
    for (const [variant, extra] of [
      ['source config', {}],
      ['sectionWidth 80, padding 0', { sectionWidth: 80, padding: 0 }],
      ['sectionWidth 10 (raised to the least)', { sectionWidth: 10 }],
    ] as const)
      it(`${name}, ${variant}`, () => {
        const layout = lay(input, { ...config, ...extra });
        expect(kanbanLayoutViolations(input, layout)).toEqual([]);
      });

  it('in the theme font measured by the table measurer, every case holds them too', () => {
    for (const [, { input, config }] of CASES) {
      const layout = layoutKanban(input, {
        config: { kanban: config } as ResolvedConfig,
        measurer: tableMeasurer,
        units: pxProfile,
        theme: createTheme(spec),
        warn: () => {},
      });
      expect(kanbanLayoutViolations(input, layout)).toEqual([]);
    }
  });

  it('catches what it checks', () => {
    const input = board('  a[A]', '    x[One]', '    y[Two]', '  b[B]');
    const good = lay(input);
    const [first, second] = good.cards;
    const moved: KanbanLayout = {
      ...good,
      cards: [
        { ...first!, x: first!.x - 50 },
        { ...second!, y: first!.y },
      ],
      bounds: { ...good.bounds, height: 1 },
    };
    const found = kanbanLayoutViolations(input, moved);
    expect(found.some((v) => v.includes('is outside its column'))).toBe(true);
    expect(found.some((v) => v.includes('overlaps'))).toBe(true);
    expect(found.some((v) => v.startsWith('the bounds do not hold'))).toBe(true);
    expect(
      kanbanLayoutViolations(input, { ...good, cards: [{ ...first!, width: -1 }, second!] })
    ).toContain(
      `card ${first!.ast} has a negative size (${first!.x}, ${first!.y}, -1 × ${first!.height})`
    );
    expect(kanbanLayoutViolations(input, { ...good, titleRow: NaN })).toEqual([
      'layout.titleRow is NaN',
    ]);
  });

  it('catches a ticket and assignee drawn over each other, or stacked out of the card', () => {
    const input = board('  a[A]', "    x[Card]@{ ticket: 'MC-12345678', assigned: 'Dana Smith' }");
    const good = lay(input);
    const c = good.cards[0]!;
    const { ticket, assignee } = c;
    const withCard = (card: KanbanLayout['cards'][number]): KanbanLayout => ({
      ...good,
      cards: [card],
    });
    expect(kanbanLayoutViolations(input, good)).toEqual([]);
    expect(
      kanbanLayoutViolations(input, withCard({ ...c, assignee: { ...assignee!, y: ticket!.y } }))
    ).toContain(`card ${c.ast}: its ticket and assignee overlap`);
    expect(kanbanLayoutViolations(input, withCard({ ...c, height: c.height - 20 }))).toContain(
      `card ${c.ast}: its assignee, stacked under the ticket, sticks out of its bottom`
    );
  });
});

describe('kanban layout in cells', () => {
  it('takes its lengths from the cell table and the config through the profile, and holds the invariants', () => {
    for (const [, { input, config }] of CASES) {
      const layout = layoutKanban(input, {
        config: { kanban: config } as ResolvedConfig,
        measurer: cellMeasurer,
        units: cellProfile(),
        theme: createTheme(spec),
        warn: () => {},
      });
      expect(layout.units).toBe('cell');
      expect(kanbanLayoutViolations(input, layout)).toEqual([]);
    }
    const { sectionWidth, radius } = layoutKanban(board('  a'), {
      config: {} as ResolvedConfig,
      measurer: cellMeasurer,
      units: cellProfile(),
      theme: createTheme(spec),
      warn: () => {},
    });
    // 200 px at 8 px a cell; text corners are square (KANBAN_CELL_METRICS, #466).
    expect([sectionWidth, radius]).toEqual([25, 0]);
    // The least W in cells still leaves card labels a cell to wrap at: 26 px is 3 cells, raised
    // to the cell table's `wrapInset` (8) + `minWrap` (1); cards are `cardInset` (4) narrower.
    const narrow = layoutKanban(board('  a[A]', '    x'), {
      config: { kanban: { sectionWidth: 26 } } as unknown as ResolvedConfig,
      measurer: cellMeasurer,
      units: cellProfile(),
      theme: createTheme(spec),
      warn: () => {},
    });
    expect(narrow.sectionWidth - narrow.cards[0]!.width).toBe(4);
    expect(narrow.sectionWidth).toBe(9);
  });

  // Pitfall 22: the cell least raises widths px allows (26 to 67 px), so it says so, once.
  it('warns once when the cell least widens the column, in place of the px raise', () => {
    const cells = (sectionWidth: number) => {
      const warnings: Warning[] = [];
      const layout = layoutKanban(board('  a[A]', '    x'), {
        config: { kanban: { sectionWidth } } as unknown as ResolvedConfig,
        measurer: cellMeasurer,
        units: cellProfile(),
        theme: createTheme(spec),
        warn: (w) => warnings.push(w),
      });
      return { width: layout.sectionWidth, warnings };
    };
    const raised = {
      code: 'KANBAN_CONFIG_IGNORED',
      path: 'kanban.sectionWidth',
      message:
        'Ignored kanban.sectionWidth: a column narrower than 9 cells (72 px) leaves its cards no width; using 9',
    };
    // 40 px is fine in px and 5 cells in text; 10 px is raised to 26 px, 3 cells.
    expect(cells(40)).toEqual({ width: 9, warnings: [raised] });
    expect(cells(10)).toEqual({ width: 9, warnings: [raised] });
    // 72 px is 9 cells: nothing raised, nothing said.
    expect(cells(72)).toEqual({ width: 9, warnings: [] });
  });
});
