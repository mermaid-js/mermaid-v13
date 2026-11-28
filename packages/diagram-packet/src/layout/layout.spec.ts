import { beforeAll, describe, expect, it } from 'vitest';
import type { PacketDiagramConfig, ResolvedConfig } from '@mermaid-js/core/config';
import { tableMeasurer, type Measurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, type ThemeSpec } from '@mermaid-js/core/theme';
import type { PacketModel } from '../model.ts';
import { packet as plugin } from '../plugin.ts';
import { FIXTURES, model, REGISTER } from './fixtures.ts';
import { layoutPacket, type PacketLayout } from './index.ts';
import { packetLayoutViolations } from './invariants.ts';
import { PACKET_METRICS } from './metrics.ts';

let spec: ThemeSpec;
beforeAll(async () => {
  spec = await loadTheme('default');
});

// A measurer with round numbers, so expected positions are worked by hand from v12's code:
// every character is 0.5 of the size wide (6 px at 12 px), the ascent is 0.8 of the size and a
// line 1.2 of it.
const halfEm: Measurer = {
  id: 'half-em',
  width: (text, font) => text.length * font.size * 0.5,
  metrics: (font) => ({
    ascent: font.size * 0.8,
    descent: font.size * 0.2,
    lineHeight: font.size * 1.2,
  }),
};

/** Lays `m` out in `default` with packet's theme table and the author's `themeVariables`. */
function lay(
  m: PacketModel,
  packet: Readonly<PacketDiagramConfig> = {},
  themeVariables?: Readonly<Record<string, unknown>>,
  measurer: Measurer = halfEm
): PacketLayout {
  return layoutPacket(m, {
    config: { packet } as unknown as ResolvedConfig,
    measurer,
    theme: createTheme(spec, { diagram: plugin.theme, ...(themeVariables && { themeVariables }) }),
  });
}

/** v12 renderer.spec's `twoFields`. */
const twoFields = (bitsPerRow = 32): PacketModel =>
  model(
    [
      [0, 7, 'foo'],
      [8, 15, 'bar'],
    ],
    { bitsPerRow }
  );

/** A row as v12 renderer.spec reads it: label, x, width and the bit numbers left to right. */
const rowOf = (l: PacketLayout, r = 0) =>
  l.rows[r]!.pieces.map((p) => ({
    label: p.label.text.lines[0]?.[0]?.text,
    x: p.box.x,
    width: p.box.width,
    bits: p.bitNumbers.map((b) => ({ text: b.text, x: b.x, anchor: b.anchor })),
  }));

describe('packet layout, worked from v12 renderer.ts and renderer.spec.ts', () => {
  it('lays fields out from bit 0, each numbered from its start bit', () => {
    expect(rowOf(lay(twoFields()))).toEqual([
      {
        label: 'foo',
        x: 1,
        width: 251,
        bits: [
          { text: '0', x: 1, anchor: 'start' },
          { text: '7', x: 252, anchor: 'end' },
        ],
      },
      {
        label: 'bar',
        x: 257,
        width: 251,
        bits: [
          { text: '8', x: 257, anchor: 'start' },
          { text: '15', x: 508, anchor: 'end' },
        ],
      },
    ]);
  });
});

describe('packet layout: descending bit order', () => {
  const register = (packet: PacketDiagramConfig = {}) =>
    lay(model(REGISTER, { bitsPerRow: 16 }), { bitsPerRow: 16, ...packet });
  const leftToRight = (l: PacketLayout) =>
    l.rows[0]!.pieces.flatMap((p) => p.bitNumbers.map((b) => [b.box.x, b.bit] as const))
      .sort((a, b) => a[0] - b[0])
      .map(([, bit]) => bit);

  it('mirrors the row so it reads from the most significant bit down', () => {
    const row = rowOf(lay(twoFields(16), { bitOrder: 'descending' }));
    // In model order: foo (bits 0-7) is now on the right.
    expect(row).toEqual([
      {
        label: 'foo',
        x: 257,
        width: 251,
        bits: [
          { text: '7', x: 257, anchor: 'start' },
          { text: '0', x: 508, anchor: 'end' },
        ],
      },
      {
        label: 'bar',
        x: 1,
        width: 251,
        bits: [
          { text: '15', x: 1, anchor: 'start' },
          { text: '8', x: 252, anchor: 'end' },
        ],
      },
    ]);
  });

  it('numbers a row of mixed-width fields straight down from its highest bit', () => {
    expect(leftToRight(register())).toEqual([0, 7, 8, 11, 12, 13, 15]);
    expect(leftToRight(register({ bitOrder: 'descending' }))).toEqual([15, 13, 12, 11, 8, 7, 0]);
  });

  it('keeps every field its width, and centres the number of a one-bit field', () => {
    const widths = (l: PacketLayout) => l.rows[0]!.pieces.map((p) => p.box.width);
    expect(widths(register({ bitOrder: 'descending' }))).toEqual(widths(register()));
    for (const l of [register(), register({ bitOrder: 'descending' })]) {
      const en = l.rows[0]!.pieces[2]!;
      expect(en.bitNumbers.map((b) => [b.text, b.anchor, b.x])).toEqual([
        ['12', 'middle', en.box.x + en.box.width / 2],
      ]);
    }
  });

  it('mirrors each row on its own, and a part-filled row is flush right', () => {
    const rows = lay(twoFields(8), { bitsPerRow: 8, bitOrder: 'descending' });
    expect(rows.rows.map((r) => r.pieces.map((p) => p.box.x))).toEqual([[1], [1]]);
    const part = lay(model([[0, 7, 'foo']]), { bitOrder: 'descending' });
    expect(part.rows[0]!.pieces[0]!.box).toMatchObject({ x: 24 * 32 + 1, width: 251 });
  });

  it('draws no bit numbers with showBits false, in either order', () => {
    for (const bitOrder of ['ascending', 'descending'] as const)
      expect(
        register({ showBits: false, bitOrder }).rows[0]!.pieces.flatMap((p) => p.bitNumbers)
      ).toEqual([]);
  });
});

describe('packet layout: canvas, rows and title', () => {
  it('is bitWidth * bitsPerRow + 2 wide, rows rowHeight + paddingY + 10 apart with showBits', () => {
    const l = lay(FIXTURES.split!.model);
    // pY = 5 + 10; three rows, no title: 47 * 4 - 32.
    expect([l.width, l.height, l.paddingY]).toEqual([1026, 156, 15]);
    expect(l.rows.map((r) => r.y)).toEqual([15, 62, 109]);
    expect(l.rows[0]!.pieces[0]!.bitNumbers[0]!.y).toBe(13);
    expect(l.rows[1]!.pieces.map((p) => [p.start, p.end, p.box.x, p.box.width])).toEqual([
      [32, 63, 1, 1019],
    ]);
  });

  it('drops the 10 px of bit-number room without showBits, and adds a row for the title', () => {
    const l = lay(FIXTURES.hello!.model, { showBits: false });
    // pY = 5; one row and the title: 37 * 2.
    expect([l.height, l.rows[0]!.y]).toEqual([74, 5]);
    // Centred on (width / 2, height - 37 / 2): 14 px text, a 16.8 px line.
    const t = l.title!;
    expect(t.x + t.width / 2).toBe(513);
    expect(t.y + t.text.lineHeight / 2).toBeCloseTo(74 - 18.5);
    expect(t.font.size).toBe(14);
  });

  it('centres each label on its piece, at 12 px', () => {
    const p = lay(twoFields()).rows[0]!.pieces[0]!;
    expect(p.label.x + p.label.width / 2).toBe(1 + 251 / 2);
    expect(p.label.y + p.label.height / 2).toBe(15 + 16);
    expect(p.label.font.size).toBe(12);
  });

  it('grows a title of several lines downwards, and decodes entities in labels', () => {
    const l = lay(FIXTURES.breaks!.model);
    expect(l.title!.text.lines).toHaveLength(2);
    expect(l.title!.y + l.title!.text.lineHeight / 2).toBeCloseTo(l.height - 47 / 2);
    expect(l.bounds.y + l.bounds.height).toBeGreaterThan(l.height);
    expect(l.rows[0]!.pieces[0]!.label.text.lines).toHaveLength(2);
    expect(l.rows[0]!.pieces[1]!.label.text.lines[0]!.map((r) => r.text).join('')).toBe(
      'Tom & Jerry'
    );
  });

  it('marks the first piece of a split field for its data-ast (D345)', () => {
    const pieces = lay(FIXTURES.split!.model).rows.flatMap((r) => r.pieces);
    expect(pieces.map((p) => [p.ast, p.first])).toEqual([
      ['field:0-10', true],
      ['field:11-90', true],
      ['field:11-90', false],
      ['field:11-90', false],
    ]);
  });
});

describe('packet layout: labels wider than their field (D343)', () => {
  it('shrinks a label to fit, down to the bit-number size, then overflows', () => {
    // 27 px piece: "abcdefgh" is 48 px at 12 px, so 6.75 px would fit; it stops at 10 px.
    const tight = lay(model([[0, 0, 'abcdefgh']])).rows[0]!.pieces[0]!.label;
    expect(tight.font.size).toBe(10);
    expect(tight.width).toBe(40);
    // "abcde" is 30 px at 12 px; at 10.8 px it is 27 px, the piece's width.
    const fits = lay(model([[0, 0, 'abcde']])).rows[0]!.pieces[0]!.label;
    expect(fits.font.size).toBeCloseTo(10.8);
    expect(fits.width).toBeCloseTo(27);
    // A label that fits keeps 12 px.
    expect(lay(model([[0, 0, 'ab']])).rows[0]!.pieces[0]!.label.font.size).toBe(12);
  });

  it('ends at the bit-number size when a measurer does not scale with the size', () => {
    // Every size above 10 px measures 6 px a character, so scaling by the overflow never fits.
    const stepped: Measurer = {
      ...halfEm,
      id: 'stepped',
      width: (text, font) => text.length * (font.size > 10 ? 6 : 5),
    };
    // A 29.5 px piece and a 30 px label: each proportional step takes off under 2%.
    const l = lay(model([[0, 0, 'abcde']]), { paddingX: 2.5 }, undefined, stepped);
    const label = l.rows[0]!.pieces[0]!.label;
    expect([label.font.size, label.width]).toEqual([10, 25]);
  });

  it('never grows a label when the bit numbers are larger than the labels', () => {
    const l = lay(model([[0, 0, 'abcdefgh']]), {}, { packetByteFontSize: 20 });
    expect(l.rows[0]!.pieces[0]!.label.font.size).toBe(12);
  });
});

describe('packet layout: a row grows to fit its tallest label (D740, #1267)', () => {
  // A 16-bit piece is 507 px wide, so only the height counts. A line is 1.2 of the size: 14.4 px
  // at 12 px. pY = 5 + 10 with showBits.
  const lines = (n: number) => Array.from({ length: n }, (_, i) => `l${i}`).join('<br>');
  const tall = (n: number, packet: Readonly<PacketDiagramConfig> = {}, title?: string) =>
    lay(
      model(
        [
          [0, 15, lines(n)],
          [16, 31, 'ok'],
          [32, 63, 'next'],
        ],
        title ? { title } : {}
      ),
      packet
    );

  it('keeps the row height and the label size while the lines fit the row', () => {
    // Two lines are 28.8 px, inside the 32 px row.
    const l = tall(2);
    const p = l.rows[0]!.pieces[0]!;
    expect([p.label.font.size, p.box.height, l.rows[0]!.height, l.rows[1]!.y]).toEqual([
      12, 32, 32, 62,
    ]);
    expect(p.label.height).toBeCloseTo(28.8);
  });

  it('grows the row to its tallest label at the label size, every piece of it', () => {
    // Four lines are 57.6 px at 12 px.
    const l = tall(4);
    const [a, b] = l.rows[0]!.pieces;
    expect(a!.label.font.size).toBe(12);
    expect(a!.label.height).toBeCloseTo(57.6);
    expect(l.rows[0]!.height).toBeCloseTo(57.6);
    expect([a!.box.y, b!.box.y]).toEqual([15, 15]);
    expect(a!.box.height).toBeCloseTo(57.6);
    expect(b!.box.height).toBeCloseTo(57.6);
    // The four lines fill the box; the one-line label is centred on the grown row.
    expect(a!.label.y).toBeCloseTo(15);
    expect(b!.label.y + b!.label.height / 2).toBeCloseTo(15 + 28.8);
  });

  it('places the next rows, their bit numbers and the canvas below the grown row', () => {
    const l = tall(4);
    // Row 1 starts pY below row 0's bottom: 15 + 57.6 + 15.
    expect(l.rows[1]!.y).toBeCloseTo(87.6);
    expect(l.rows[1]!.height).toBe(32);
    expect(l.rows[1]!.pieces[0]!.box.height).toBe(32);
    expect(l.rows[1]!.pieces[0]!.bitNumbers[0]!.y).toBeCloseTo(85.6);
    // The canvas ends pY below the last row, as v12's does.
    expect(l.height).toBeCloseTo(87.6 + 32 + 15);
    expect(l.bounds.height).toBeCloseTo(l.height);
  });

  it('puts the title in the row below the grown rows', () => {
    const l = tall(4, { showBits: false }, 'Title');
    // pY = 5: rows at 5 and 5 + 57.6 + 5; the title row is rowHeight + pY below the last row.
    expect(l.rows[1]!.y).toBeCloseTo(67.6);
    expect(l.height).toBeCloseTo(67.6 + 32 + 5 + 32);
    const t = l.title!;
    expect(t.y + t.text.lineHeight / 2).toBeCloseTo(l.height - 37 / 2);
  });

  it('still shrinks a label to fit the width, and grows the row to what that leaves', () => {
    // A 27 px one-bit piece: "abcd<br>abcd<br>abcd" is 24 px wide, so it keeps 12 px and the
    // row grows to 43.2 px; "abcde<br>abcde" is 30 px wide, so it shrinks to 10.8 px and its
    // 25.92 px fit the 32 px row.
    const grown = lay(model([[0, 0, 'abcd<br>abcd<br>abcd']])).rows[0]!;
    expect(grown.pieces[0]!.label.font.size).toBe(12);
    expect(grown.height).toBeCloseTo(43.2);
    const narrow = lay(model([[0, 0, 'abcde<br>abcde']])).rows[0]!;
    expect(narrow.pieces[0]!.label.font.size).toBeCloseTo(10.8);
    expect(narrow.height).toBe(32);
  });

  it('grows a row lower than one line of its label', () => {
    const l = lay(model([[0, 15, 'one']]), { rowHeight: 4 });
    expect(l.rows[0]!.pieces[0]!.label.font.size).toBe(12);
    expect(l.rows[0]!.height).toBeCloseTo(14.4);
  });
});

describe('packet layout: crowded bit numbers (D747, #1268)', () => {
  /** Each piece's bit numbers in a row, as text. */
  const numbers = (l: PacketLayout, r = 0) =>
    l.rows[r]!.pieces.map((p) => p.bitNumbers.map((b) => b.text));
  /** Two 16-bit fields: 15's box ends `paddingX` before 16's starts. */
  const halves = model([
    [0, 15, 'a'],
    [16, 31, 'b'],
  ]);

  it('drops an end number that meets a start number, its own or the next field’s', () => {
    // halfEm: a 3-digit number is 15 px wide, a 2-bit piece 19 px at bitWidth 12.
    const { model: m, config } = FIXTURES.crowded!;
    const l = lay(m, config);
    expect(numbers(l, 6)).toEqual([
      ['96'],
      ['98'],
      ['100'],
      ['102'],
      ['104'],
      ['105'],
      ['106', '111'],
    ]);
    // The rows of one wide field keep both numbers.
    expect(numbers(l, 0)).toEqual([['0', '15']]);
  });

  it('keeps start numbers, so 15 and 16 no longer run together with paddingX 0', () => {
    expect(numbers(lay(halves, { paddingX: 0 }))).toEqual([['0'], ['16', '31']]);
    // Descending: the left field is bar (15-8), so its end number 8 goes.
    expect(numbers(lay(twoFields(16), { paddingX: 0, bitOrder: 'descending' }))).toEqual([
      ['7', '0'],
      ['15'],
    ]);
  });

  it('keeps an end number exactly the minimum gap clear of the next, and drops a closer one', () => {
    const at = (paddingX: number) => numbers(lay(halves, { paddingX }))[0];
    expect(at(PACKET_METRICS.bitNumberSpace)).toEqual(['0', '15']);
    expect(at(PACKET_METRICS.bitNumberSpace - 0.5)).toEqual(['0']);
  });

  it('keeps every number with the default config', () => {
    const l = lay(FIXTURES.tcp!.model, {}, undefined, tableMeasurer);
    for (const p of l.rows.flatMap((r) => r.pieces))
      expect(p.bitNumbers).toHaveLength(p.bits === 1 ? 1 : 2);
  });
});

describe('packet layout: bounding box (D344)', () => {
  it('is v12’s viewBox when nothing runs past it, half the stroke included', () => {
    expect(lay(FIXTURES.tcp!.model).bounds).toEqual({
      x: 0,
      y: 0,
      width: 1026,
      height: 47 * 8 - 32,
    });
  });

  it('grows to a title or a label that runs past the canvas, keeping every position', () => {
    const wide = lay(FIXTURES.wideTitle!.model, { bitsPerRow: 4 });
    expect(wide.width).toBe(130);
    expect(wide.bounds.x).toBeLessThan(0);
    expect(wide.bounds.x + wide.bounds.width).toBeGreaterThan(130);
    expect(wide.rows[0]!.pieces[0]!.box.x).toBe(1);
  });
});

describe('packet layout: config and theme', () => {
  it('falls back to v12’s defaults for options the parser rejected, without a warning (D342)', () => {
    const { model: m, config } = FIXTURES.invalidConfig!;
    expect(lay(m, config)).toEqual(lay(m));
  });

  it('lays rows out with the model’s bitsPerRow, which the parser split them with', () => {
    expect(lay(twoFields(8), { bitsPerRow: 'x' as unknown as number }).width).toBe(258);
  });

  it('never makes a piece narrower than 0 (D342)', () => {
    const pieces = lay(
      model([
        [0, 0, 'a'],
        [1, 7, 'b'],
      ]),
      { paddingX: 40 }
    ).rows[0]!.pieces;
    expect(pieces.map((p) => p.box.width)).toEqual([0, 184]);
  });

  it('reads the font sizes and the stroke from packet’s theme variables, v12’s by default', () => {
    const l = lay(twoFields());
    expect([l.fonts.label.size, l.fonts.byte.size, l.fonts.title.size, l.strokeWidth]).toEqual([
      12, 10, 14, 1,
    ]);
    expect(l.fonts.label.family).toBe(createTheme(spec).value('fontFamily'));
    // v12's nested keys (D335), and a flat name beside them.
    const themed = lay(
      twoFields(),
      {},
      {
        packet: { labelFontSize: 16, byteFontSize: '8px', titleFontSize: 20 },
        packetBlockStrokeWidth: 3,
      }
    );
    expect([
      themed.fonts.label.size,
      themed.fonts.byte.size,
      themed.fonts.title.size,
      themed.strokeWidth,
    ]).toEqual([16, 8, 20, 3]);
  });
});

describe('packet layout: positions do not depend on measurements', () => {
  // Measurements shrink labels (D343), grow the bounds (D344), grow a row to a label taller
  // than it (D740) and drop an end number that would meet the next (D747): while every label
  // fits its row, two measurers that disagree on every width and line height give the same boxes
  // and anchor points, and every end number `wide` keeps
  // is where the table measurer puts it.
  const wide: Measurer = {
    id: 'wide',
    width: (text, font) => text.length * font.size * 1.7,
    metrics: (font) => ({
      ascent: font.size * 1.1,
      descent: font.size * 0.4,
      lineHeight: font.size * 1.9,
    }),
  };
  const points = (l: PacketLayout) => ({
    canvas: [l.width, l.height],
    pieces: l.rows.flatMap((r) =>
      r.pieces.map((p) => ({
        box: p.box,
        label: [p.label.x + p.label.width / 2, p.label.y + p.label.height / 2],
        bits: p.bitNumbers.filter((b) => b.role === 'start').map((b) => [b.x, b.y, b.anchor]),
      }))
    ),
    title: l.title && [l.title.x + l.title.width / 2, titlePoint(l)],
  });
  // A title line taller than the row pitch sits on the last row: a measurement moves it, so it
  // is compared as that rule, not as a point.
  const titlePoint = (l: PacketLayout) => {
    const t = l.title!;
    const last = l.rows[l.rows.length - 1];
    if (last && t.y === last.y + last.height) return 'on the last row';
    return t.y + t.text.lineHeight / 2;
  };
  // Labels taller than their rows in one measurer or both: `breaks` (two lines, 45.6 px in
  // `wide`), `tallLabel` and `tiny` (1 px rows).
  const growing = new Set(['breaks', 'tallLabel', 'tiny']);
  const grows = (l: PacketLayout) => l.rows.some((r) => r.height !== l.options.rowHeight);

  it.each(Object.keys(FIXTURES).filter((n) => !growing.has(n)))('%s', (name) => {
    const { model: m, config } = FIXTURES[name]!;
    const a = lay(m, config, undefined, tableMeasurer);
    const b = lay(m, config, undefined, wide);
    expect(points(b)).toEqual(points(a));
    const ends = (l: PacketLayout) =>
      l.rows.flatMap((r) =>
        r.pieces.flatMap((p) =>
          p.bitNumbers.filter((n) => n.role === 'end').map((n) => [n.bit, n.x, n.y] as const)
        )
      );
    const all = new Set(ends(a).map((e) => e.join()));
    for (const e of ends(b)) expect(all).toContain(e.join());
    expect(packetLayoutViolations(m, b)).toEqual([]);
  });

  it.each([...growing])('%s grows its rows, and holds the invariants in both', (name) => {
    const { model: m, config } = FIXTURES[name]!;
    const b = lay(m, config, undefined, wide);
    expect(grows(b)).toBe(true);
    expect(packetLayoutViolations(m, lay(m, config, undefined, tableMeasurer))).toEqual([]);
    expect(packetLayoutViolations(m, b)).toEqual([]);
  });

  it('keeps the title below the last row when its font is larger than the row pitch', () => {
    const m = FIXTURES.hello!.model;
    const l = lay(m, { showBits: false }, { packetTitleFontSize: 60 });
    expect(packetLayoutViolations(m, l)).toEqual([]);
    expect(l.title!.y).toBe(l.rows[0]!.y + 32);
  });
});
