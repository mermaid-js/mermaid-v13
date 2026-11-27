import { beforeAll, describe, expect, it } from 'vitest';
import type { Warning } from '@mermaid-js/core';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import { cellMeasurer } from '@mermaid-js/core/ascii';
import { cellProfile, pxProfile } from '@mermaid-js/core/layout';
import { Style, tableMeasurer } from '@mermaid-js/core/text';
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

// A column title keeps the room under its last line that a one-line title has, however many
// lines it wraps to (the title room): with the table measurer a 16 px line is shorter than the
// 25 px row, so without it a title of two lines ends on the first card's top border.
describe('kanban layout: the room under a column title', () => {
  const roomUnder = (title: string): number => {
    const { columns, cards } = layoutKanban(board(`  a[${title}]`, '    c[Card]'), {
      config: { kanban: {} } as ResolvedConfig,
      measurer: tableMeasurer,
      units: pxProfile,
      theme: createTheme(spec),
      warn: () => undefined,
    });
    const label = columns[0]!.title!;
    return cards[0]!.y - (label.y + label.height);
  };

  it('is the same under one, two and three lines', () => {
    const one = roomUnder('One');
    expect(one).toBeGreaterThan(0);
    expect(roomUnder('One<br>two')).toBeCloseTo(one, 6);
    expect(roomUnder('One<br>two<br>three')).toBeCloseTo(one, 6);
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

describe('kanban layout: tags in a ticket and an assignee (D710, D712)', () => {
  it('sizes their boxes and the card by the measured labels, without the tags', () => {
    const tagged = lay(
      board('  Todo', "    a[Card]@{ ticket: '<b>T-1</b>', assigned: '<i>knsv</i>' }")
    ).cards[0]!;
    const plain = lay(board('  Todo', "    a[Card]@{ ticket: 'T-1', assigned: 'knsv' }")).cards[0]!;
    // The grid measurer gives every character 8 px, bold or italic alike.
    expect(tagged.ticket!.width).toBe(3 * 8);
    expect(tagged.assignee!.width).toBe(4 * 8);
    expect(tagged.ticket!.text.lines[0]!.map((r) => [r.text, !!r.bold])).toEqual([['T-1', true]]);
    expect(tagged.assignee!.text.lines[0]!.map((r) => [r.text, !!r.italic])).toEqual([
      ['knsv', true],
    ]);
    for (const k of ['x', 'y', 'width', 'height'] as const) {
      expect(tagged.ticket![k]).toBe(plain.ticket![k]);
      expect(tagged.assignee![k]).toBe(plain.assignee![k]);
    }
    expect(tagged.height).toBe(plain.height);
  });

  it('draws a code span and a leading list marker in a plain card as written (D712)', () => {
    const cards = lay(board('  Todo', '    a[Use `npm ci` first]', '    b[- 5 degrees]')).cards;
    const text = (i: number): string[] =>
      cards[i]!.title!.text.lines.map((line) => line.map((r) => r.text).join(''));
    expect(text(0)).toEqual(['Use `npm ci` first']);
    expect(text(1)).toEqual(['- 5 degrees']);
    expect(cards[0]!.title!.text.lines.flat().some((r) => (r.style & Style.Mono) !== 0)).toBe(
      false
    );
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
  it('takes kanban.sectionWidth as W, wrapping card titles at W − 35 (D764)', () => {
    const title = 'aaaa bbbb cccc dddd eeee ffff gggg hhhh';
    const narrow = lay(board('  a[A]', `    x[${title}]`), { sectionWidth: 100 });
    const wide = lay(board('  a[A]', `    x[${title}]`), { sectionWidth: 300 });
    expect(narrow.cards[0]!.width).toBe(85);
    // 65 px wrap: 'aaaa bbbb' is 72 wide, so one word a line.
    expect(narrow.cards[0]!.title!.text.lines.length).toBe(8);
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
    for (const sectionWidth of [1, 10, 35.5]) {
      const warnings: Warning[] = [];
      const layout = lay(board('  a[A]', '    x[a b]'), { sectionWidth }, warnings);
      expect(layout.sectionWidth).toBe(36);
      // W − 15 wide, its title wrapped at W − 35 = 1 (D764): one word a line.
      expect(layout.cards[0]!.width).toBe(21);
      expect(layout.cards[0]!.title!.text.lines.length).toBe(2);
      expect(warnings.map((w) => [w.code, w.path])).toEqual([
        ['KANBAN_CONFIG_IGNORED', 'kanban.sectionWidth'],
      ]);
    }
    expect(lay(board('  a'), { sectionWidth: 36 }).sectionWidth).toBe(36);
  });

  it('takes a numeric string as v12 did, and sectionWidth 0 as 200 with no warning', () => {
    const warnings: Warning[] = [];
    expect(lay(board('  a'), { sectionWidth: '300' }, warnings).sectionWidth).toBe(300);
    expect(lay(board('  a'), { sectionWidth: 0 }, warnings).sectionWidth).toBe(200);
    expect(warnings).toEqual([]);
  });
});

// D764: card text wraps at `W − cardInset − 2·labelInset` (165 px at the default W), so every
// line ends at least `labelInset` (10 px) inside the card's right edge, as v12 drew it (#1294).
// With `gridMeasurer` (8 px a character) a line of 20 characters (160 px) fits 165; one of 21
// (168 px) does not. Before D764 the wrap was `W − 25` and a 21-character line ran to the border.
describe('kanban layout: card text keeps the label inset on both sides (D764)', () => {
  // Five-character words: 'aaaa bbbb cccc dddd' is 19 characters (152 px); one more word, 24.
  const words = 'aaaa bbbb cccc dddd eeee ffff gggg hhhh iiii jjjj kkkk llll mmmm nnnn';
  // 'abcdefghij abcdefghij' is 21 characters: it fit `W − 25` (175) on one line, not 165.
  const filling = 'abcdefghij abcdefghij abcdefghij abcdefghij';
  const input = board(
    '  a[Todo]',
    `    x[${filling}]@{ ticket: '${filling}', assigned: '${words}' }`
  );

  for (const sectionWidth of [200, 300])
    it(`ends every line of the title, ticket and assignee 10 px inside the card, W = ${sectionWidth}`, () => {
      const layout = lay(input, { sectionWidth });
      const card = layout.cards[0]!;
      for (const label of [card.title!, card.ticket!, card.assignee!]) {
        expect(label.x).toBeGreaterThanOrEqual(card.x + 10);
        for (const w of label.text.widths)
          expect(label.x + w).toBeLessThanOrEqual(card.x + card.width - 10);
      }
      expect(kanbanLayoutViolations(input, layout)).toEqual([]);
    });

  it('wraps at 165 px at the default width: a 21-character line no longer fits', () => {
    const card = lay(input).cards[0]!;
    expect(card.title!.text.lines.length).toBe(4);
    expect(card.title!.text.widths).toEqual([80, 80, 80, 80]);
    // 'aaaa … dddd' (152 px) fits; adding ' eeee' (192) does not.
    expect(card.assignee!.text.widths[0]).toBe(152);
  });

  it('wraps at 265 px at sectionWidth 300: three 10-character words (256 px) fit on a line', () => {
    const card = lay(input, { sectionWidth: 300 }).cards[0]!;
    expect(card.title!.text.widths).toEqual([256, 80]);
  });

  it('keeps the left inset: text starts 10 px in from the card', () => {
    const card = lay(input).cards[0]!;
    expect([card.title!.x - card.x, card.ticket!.x - card.x]).toEqual([10, 10]);
  });
});

// D764: a column title wraps at `W − 2·labelInset` (180 px at the default W) and is centred
// inside that inset, in line with the card text. Before, it wrapped at `W`, edge to edge.
describe('kanban layout: a column title keeps the label inset (D764)', () => {
  // 23 characters, 184 px: one line at `W`, two at 180.
  const title = 'aaaaaaa bbbbbbb ccccccc';

  it('wraps at W − 20 and stays 10 px inside both sides, centred', () => {
    const input = board(`  a[${title}]`, '    x[Card]');
    const layout = lay(input);
    const column = layout.columns[0]!;
    const label = column.title!;
    expect(label.text.lines.length).toBe(2);
    expect(label.x).toBeGreaterThanOrEqual(column.x + 10);
    expect(label.x + label.width).toBeLessThanOrEqual(column.x + column.width - 10);
    expect(label.x + label.width / 2).toBe(column.x + column.width / 2);
    expect(kanbanLayoutViolations(input, layout)).toEqual([]);
  });

  it('leaves a title that fits on one line where it was', () => {
    const [todo] = lay(board('  Todo')).columns;
    expect(todo!.title!.x).toBe(184);
  });
});

// D765 (amends D372): a word wider than the wrap breaks between characters, in px as in cells,
// so no card or column text crosses its box's right edge. v12 let it overflow (#1304, F-008).
describe('kanban layout: a word wider than its wrap width (D765)', () => {
  const word = 'Supercalifragilisticexpialidociousandevenlongerwordhere';
  const input = board(`  e[${word}]`, `    c[${word}]@{ ticket: ${word}, assigned: ${word} }`);
  const text = (label: { text: { lines: { text: string }[][] } }): string[] =>
    label.text.lines.map((l) => l.map((r) => r.text).join(''));

  it('breaks it in every label kind, inside the label inset', () => {
    const layout = lay(input);
    const column = layout.columns[0]!;
    const card = layout.cards[0]!;
    // 55 characters at 8 px: 20 a line in the 165 px card wrap, 22 in the 180 px title wrap.
    expect(text(column.title!)).toEqual([word.slice(0, 22), word.slice(22, 44), word.slice(44)]);
    for (const label of [card.title!, card.ticket!, card.assignee!])
      expect(text(label)).toEqual([word.slice(0, 20), word.slice(20, 40), word.slice(40)]);
    expect(column.title!.x).toBe(column.x + 12);
    expect(card.title!.x + card.title!.width).toBe(card.x + 10 + 160);
    expect(card.assignee!.x + card.assignee!.width).toBe(card.x + card.width - 10);
    expect(kanbanLayoutViolations(input, layout)).toEqual([]);
  });

  it('is split between characters in cells, as before', () => {
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

  it('catches card and column text closer than labelInset to a side (D764)', () => {
    const input = board('  a[Todo]', "    x[Card one]@{ ticket: 'MC-1', assigned: 'knsv' }");
    const good = lay(input);
    const card = good.cards[0]!;
    const column = good.columns[0]!;
    expect(kanbanLayoutViolations(input, good)).toEqual([]);
    const at = (label: 'title' | 'ticket' | 'assignee', x: number): KanbanLayout => ({
      ...good,
      cards: [{ ...card, [label]: { ...card[label]!, x } }],
    });
    // 9 px in from the left, then 9 px in from the right.
    expect(kanbanLayoutViolations(input, at('title', card.x + 9))).toEqual([
      `card ${card.ast}: its title is within 10 of its sides`,
    ]);
    const assignee = card.assignee!;
    expect(
      kanbanLayoutViolations(input, at('assignee', card.x + card.width - 9 - assignee.width))
    ).toEqual([`card ${card.ast}: its assignee is within 10 of its sides`]);
    // A title as wide as its column, centred: on both edges.
    const wide = { ...column.title!, x: column.x, width: column.width };
    expect(
      kanbanLayoutViolations(input, { ...good, columns: [{ ...column, title: wide }] })
    ).toEqual([`column ${column.ast}: its title is within 10 of its sides`]);
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

  // Pitfall 22: the cell least raises widths px allows (36 to 71 px), so it says so, once.
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
    // 40 px is fine in px and 5 cells in text; 10 px is raised to 36 px, 5 cells.
    expect(cells(40)).toEqual({ width: 9, warnings: [raised] });
    expect(cells(10)).toEqual({ width: 9, warnings: [raised] });
    // 72 px is 9 cells: nothing raised, nothing said.
    expect(cells(72)).toEqual({ width: 9, warnings: [] });
  });
});
