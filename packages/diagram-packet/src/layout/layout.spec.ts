import { beforeAll, describe, expect, it } from 'vitest';
import type { PacketDiagramConfig, ResolvedConfig } from '@mermaid-js/core/config';
import type { Measurer } from '@mermaid-js/core/text';
import {
  createTheme,
  loadTheme,
  type DiagramThemeTable,
  type ThemeSpec,
} from '@mermaid-js/core/theme';
import type { PacketModel } from '../model.ts';
import { FIXTURES, model, REGISTER } from './fixtures.ts';
import { layoutPacket, type PacketLayout } from './index.ts';

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

// Packet's theme table is T4's (#460); this stand-in declares the four lengths the layout reads.
const sizes = (tokens: Record<string, number>): DiagramThemeTable => ({
  vars: {
    packetByteFontSize: { alias: 'tpkb', kind: 'length' },
    packetLabelFontSize: { alias: 'tpkl', kind: 'length' },
    packetTitleFontSize: { alias: 'tpkt', kind: 'length' },
    packetBlockStrokeWidth: { alias: 'tpks', kind: 'length' },
  },
  rules: { light: {} },
  families: { classic: { tokens } },
});

function lay(
  m: PacketModel,
  packet: Readonly<PacketDiagramConfig> = {},
  diagram?: DiagramThemeTable
): PacketLayout {
  return layoutPacket(m, {
    config: { packet } as unknown as ResolvedConfig,
    measurer: halfEm,
    theme: createTheme(spec, diagram ? { diagram } : {}),
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

  it('never grows a label when the bit numbers are larger than the labels', () => {
    const l = lay(model([[0, 0, 'abcdefgh']]), {}, sizes({ packetByteFontSize: 20 }));
    expect(l.rows[0]!.pieces[0]!.label.font.size).toBe(12);
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

  it('reads the three font sizes from the theme once packet declares them, else v12’s', () => {
    const l = lay(twoFields());
    expect([l.fonts.label.size, l.fonts.byte.size, l.fonts.title.size, l.strokeWidth]).toEqual([
      12, 10, 14, 1,
    ]);
    expect(l.fonts.label.family).toBe(createTheme(spec).value('fontFamily'));
    const themed = lay(
      twoFields(),
      {},
      sizes({
        packetLabelFontSize: 16,
        packetByteFontSize: 8,
        packetTitleFontSize: 20,
        packetBlockStrokeWidth: 3,
      })
    );
    expect([
      themed.fonts.label.size,
      themed.fonts.byte.size,
      themed.fonts.title.size,
      themed.strokeWidth,
    ]).toEqual([16, 8, 20, 3]);
  });
});
