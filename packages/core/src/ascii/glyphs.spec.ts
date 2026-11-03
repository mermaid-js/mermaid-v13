import { describe, expect, it } from 'vitest';
import { ascii, glyphFor, junction, unicode, type GlyphSet } from './glyphs.ts';

describe('glyph sets (D79)', () => {
  it.each<[string, GlyphSet, Record<string, unknown>]>([
    [
      'unicode',
      unicode,
      {
        solid: '─│┌┐└┘',
        dotted: '┄┆┌┐└┘',
        thick: '━┃┏┓┗┛',
        rounded: '─│╭╮╰╯',
        double: '═║╔╗╚╝',
        tee: '┴┬┤├',
        head: '▲▼◄►',
        circle: '●',
        cross: '✕',
      },
    ],
    [
      'ascii',
      ascii,
      {
        solid: '-|++++',
        dotted: '.:++++',
        thick: '=I++++',
        rounded: '-|++++',
        double: '=I++++',
        tee: '++++',
        head: '^v<>',
        circle: 'o',
        cross: 'x',
      },
    ],
  ])('%s', (name, set, expected) => {
    const flat = (o: object) => Object.values(o).join('');
    expect(set.name).toBe(name);
    expect({
      solid: flat(set.solid),
      dotted: flat(set.dotted),
      thick: flat(set.thick),
      rounded: flat(set.rounded),
      double: flat(set.double),
      tee: flat(set.tee),
      head: flat(set.head),
      circle: set.circle,
      cross: set.cross,
    }).toEqual(expected);
  });

  it('names strokes by place and heads by the way they point', () => {
    expect(unicode.solid).toEqual({ h: '─', v: '│', tl: '┌', tr: '┐', bl: '└', br: '┘' });
    expect(unicode.head).toEqual({ up: '▲', down: '▼', left: '◄', right: '►' });
    expect(unicode.tee).toEqual({ up: '┴', down: '┬', left: '┤', right: '├' });
  });

  it('every ASCII glyph is printable ASCII', () => {
    const all = JSON.stringify(ascii).replace(/"(name|solid|dotted|thick|rounded|double)"/g, '');
    expect(all).toMatch(/^[\x20-\x7e]*$/);
  });
});

// mermaid-ascii's `mergeJunctions` table (pkg/graph/draw.go at 5a9df15), verbatim. Every
// pair it defines must merge the same way here.
const MERMAID_ASCII: Record<string, Record<string, string>> = {
  '─': { '│': '┼', '┌': '┬', '┐': '┬', '└': '┴', '┘': '┴', '├': '┼', '┤': '┼', '┬': '┬', '┴': '┴' },
  '│': { '─': '┼', '┌': '├', '┐': '┤', '└': '├', '┘': '┤', '├': '├', '┤': '┤', '┬': '┼', '┴': '┼' },
  '┌': { '─': '┬', '│': '├', '┐': '┬', '└': '├', '┘': '┼', '├': '├', '┤': '┼', '┬': '┬', '┴': '┼' },
  '┐': { '─': '┬', '│': '┤', '┌': '┬', '└': '┼', '┘': '┤', '├': '┼', '┤': '┤', '┬': '┬', '┴': '┼' },
  '└': { '─': '┴', '│': '├', '┌': '├', '┐': '┼', '┘': '┴', '├': '├', '┤': '┼', '┬': '┼', '┴': '┴' },
  '┘': { '─': '┴', '│': '┤', '┌': '┼', '┐': '┤', '└': '┴', '├': '┼', '┤': '┤', '┬': '┼', '┴': '┴' },
  '├': { '─': '┼', '│': '├', '┌': '├', '┐': '┼', '└': '├', '┘': '┼', '┤': '┼', '┬': '┼', '┴': '┼' },
  '┤': { '─': '┼', '│': '┤', '┌': '┼', '┐': '┤', '└': '┼', '┘': '┤', '├': '┼', '┬': '┼', '┴': '┼' },
  '┬': { '─': '┬', '│': '┼', '┌': '┬', '┐': '┬', '└': '┼', '┘': '┼', '├': '┼', '┤': '┼', '┴': '┼' },
  '┴': { '─': '┴', '│': '┼', '┌': '┼', '┐': '┼', '└': '┴', '┘': '┴', '├': '┼', '┤': '┼', '┬': '┼' },
};

// Every line glyph of a set, plus the crossing.
const UNICODE_LINES = [
  ...new Set(
    [unicode.solid, unicode.dotted, unicode.thick, unicode.rounded, unicode.double]
      .flatMap((s) => Object.values(s))
      .concat(Object.values(unicode.tee), '┼')
  ),
];
const ASCII_LINES = ['-', '|', '.', ':', '=', 'I', '+'];
// Merged glyphs outside the sets' own tables.
const MIXED = [...'┼┽┾┿╀╁╂╃╄╅╆╇╈╉╊╋┝┞┟┠┡┢┣┥┦┧┨┩┪┫┭┮┯┰┱┲┳┵┶┷┸┹┺┻┍┎┑┒┕┖┙┚╒╓╕╖╘╙╛╜╞╟╠╡╢╣╤╥╦╧╨╩╪╫╬'];

describe('junction (D79): one lookup for every pair', () => {
  it('matches mermaid-ascii on every pair its table defines', () => {
    for (const [a, row] of Object.entries(MERMAID_ASCII)) {
      for (const [b, merged] of Object.entries(row)) {
        expect(junction(a, b), `${a} + ${b}`).toBe(merged);
      }
    }
  });

  // Rows: the glyph already drawn; columns: the glyph drawn over it.
  it('merges every ASCII pair', () => {
    const table = [
      '· - | . : = I +',
      '- - + - + = + +',
      '| + | + | + I +',
      '. - + . + = + +',
      ': + | + : + I +',
      '= = + = + = + +',
      'I + I + I + I +',
      '+ + + + + + + +',
    ].map((row) => row.split(' ').filter(Boolean));
    const [, ...cols] = table[0] as string[];
    for (const [a, ...merged] of table.slice(1)) {
      cols.forEach((b, i) => expect(junction(a as string, b), `${a} + ${b}`).toBe(merged[i]));
    }
  });

  it.each([
    // heavy
    ['━', '│', '┿'],
    ['┃', '─', '╂'],
    ['━', '┃', '╋'],
    ['┏', '─', '┲'],
    ['┃', '┌', '┠'],
    ['┃', '┍', '┣'],
    ['━', '┬', '┯'],
    ['┗', '┘', '┺'],
    // dashed merges as its solid shape
    ['┄', '│', '┼'],
    ['┆', '─', '┼'],
    ['┄', '┆', '┼'],
    ['┆', '┌', '├'],
    ['┄', '━', '━'],
    ['┄', '┄', '┄'],
    ['┅', '│', '┿'],
    // double
    ['═', '│', '╪'],
    ['║', '─', '╫'],
    ['═', '║', '╬'],
    ['║', '┌', '╟'],
    ['═', '┬', '╤'],
    ['╒', '│', '╞'],
    // rounded corners merge as square ones
    ['╭', '─', '┬'],
    ['│', '╯', '┤'],
    ['╭', '╯', '┼'],
    ['╭', '╭', '╭'],
    // mixes Unicode has no glyph for: the later glyph wins
    ['═', '┃', '┃'],
    ['━', '║', '║'],
    ['╔', '│', '│'],
  ])('%s + %s → %s', (a, b, merged) => {
    expect(junction(a, b)).toBe(merged);
  });

  it('lets the later glyph win over anything that is not a line', () => {
    for (const [a, b] of [
      [' ', '─'],
      ['─', ' '],
      ['A', '│'],
      ['─', '►'],
      ['▲', '│'],
      ['', '─'],
      ['-', '─'],
      ['|', 'v'],
    ]) {
      expect(junction(a as string, b as string), `${a} + ${b}`).toBe(b);
    }
  });

  it.each([
    ['unicode', UNICODE_LINES],
    ['ascii', ASCII_LINES],
  ])('is idempotent and symmetric over every %s line pair', (_, lines) => {
    for (const a of lines) {
      expect(junction(a, a)).toBe(a);
      for (const b of lines) {
        const ab = junction(a, b);
        expect(lines.concat(UNICODE_LINES, MIXED)).toContain(ab);
        // Symmetric whenever both orders produce a merge (not a fallback to the later one).
        if (ab !== b && junction(b, a) !== a) expect(junction(b, a), `${a} + ${b}`).toBe(ab);
      }
    }
  });
});

describe('glyphFor', () => {
  it('gives the glyph with exactly the requested arms', () => {
    expect(glyphFor(0x11, unicode)).toBe('─');
    expect(glyphFor(0x14, unicode)).toBe('┌');
    expect(glyphFor(0x34, unicode)).toBe('╒');
    expect(glyphFor(0x55, unicode)).toBe('┼');
    expect(glyphFor(0xff, unicode)).toBe('╬');
    expect(glyphFor(0x01, unicode)).toBe('╴');
    expect(glyphFor(0, unicode)).toBeUndefined();
    expect(glyphFor(0xe0, unicode)).toBeUndefined();
  });

  it('collapses arms to + - | = I in ASCII', () => {
    expect([0x11, 0x44, 0x22, 0x88, 0x14, 0xff, 0x33].map((a) => glyphFor(a, ascii))).toEqual([
      '-',
      '|',
      '=',
      'I',
      '+',
      '+',
      '=',
    ]);
    expect(glyphFor(0, ascii)).toBeUndefined();
  });
});
