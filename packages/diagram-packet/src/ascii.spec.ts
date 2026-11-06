import { describe, expect, it } from 'vitest';
import { draw, text } from './ascii/packet.fixtures.ts';

// Packet's `ascii` hook (#464, D347, D320, R-ASCII-5, R-ASCII-6), through the `./ascii` entry
// with the generated `packet` defaults (32 bits a row, bit numbers on). D347: one table of boxes
// sharing borders, 2 columns a bit, labels cut to the field with `…`, bit numbers on a line
// above each row, `descending` mirrored, the title centred below.

const lines = (...rows: string[]): string => rows.join('\n');

const UDP = [
  'packet',
  '  title UDP',
  '  0-15: "Source Port"',
  '  16-31: "Destination Port"',
  '  +16: "Length"',
  '  +16: "Checksum"',
].join('\n');

describe('rows', () => {
  it('draws 32 bits in 65 columns, bit numbers above each row and the title centred below', () => {
    expect(text(UDP)).toBe(
      lines(
        ' 0                            15 16                           31',
        '┌───────────────────────────────┬───────────────────────────────┐',
        '│          Source Port          │       Destination Port        │',
        '└───────────────────────────────┴───────────────────────────────┘',
        ' 32                           47 48                           63',
        '┌───────────────────────────────┬───────────────────────────────┐',
        '│            Length             │           Checksum            │',
        '└───────────────────────────────┴───────────────────────────────┘',
        '                               UDP'
      )
    );
  });

  it('has an ascii form: + at every corner and junction', () => {
    expect(text(UDP, { charset: 'ascii' }).split('\n').slice(1, 4)).toEqual([
      '+-------------------------------+-------------------------------+',
      '|          Source Port          |       Destination Port        |',
      '+-------------------------------+-------------------------------+',
    ]);
  });

  it('shares the borders between rows when bit numbers are off, a shorter last row included', () => {
    const src = 'packet\n0-3: "a"\n4-7: "b"\n8-11: "c"\n12-15: "d"\n16-19: "e"';
    const packet = { bitsPerRow: 8, showBits: false };
    expect(text(src, { packet })).toBe(
      lines(
        '┌───────┬───────┐',
        '│   a   │   b   │',
        '├───────┼───────┤',
        '│   c   │   d   │',
        '├───────┼───────┘',
        '│   e   │',
        '└───────┘'
      )
    );
    expect(text(src, { packet, charset: 'ascii' }).split('\n')[4]).toBe('+-------+-------+');
  });

  it('draws each piece of a field split across rows with its label', () => {
    const src = 'packet\n0-3: "a"\n4-11: "split"\n12-15: "b"';
    expect(text(src, { packet: { bitsPerRow: 8, showBits: false } })).toBe(
      lines(
        '┌───────┬───────┐',
        '│   a   │ split │',
        '├───────┼───────┤',
        '│ split │   b   │',
        '└───────┴───────┘'
      )
    );
  });

  it('mirrors descending: bit 0 on the right, the higher number first in each field', () => {
    // e2e/diagrams/packet/pr-check/should-render-a-packet-diagram-with-descending-bit-order.mmd
    const src = [
      '---',
      'title: "Status Register"',
      'config:',
      '  packet:',
      '    showBits: true',
      '    bitOrder: descending',
      '    bitsPerRow: 16',
      '---',
      'packet',
      '  0-7: "DATA"',
      '  8-11: "TYPE"',
      '  12: "EN"',
      '  13-15: "RESERVED"',
    ].join('\n');
    expect(text(src)).toBe(
      lines(
        ' 15 13 12      8 7             0',
        '┌─────┬─┬───────┬───────────────┐',
        '│RESE…│…│ TYPE  │     DATA      │',
        '└─────┴─┴───────┴───────────────┘',
        '         Status Register'
      )
    );
  });

  it('leaves out a bit number that would run into the one before it', () => {
    const src = 'packet\n0-7: "a"\n8: "b"\n9: "c"\n10: "d"\n11: "e"\n12: "f"';
    expect(text(src, { packet: { bitsPerRow: 16 } }).split('\n')[0]).toBe(
      ' 0             7 8 9 10  12'
    );
  });
});

describe('padding', () => {
  it('honours ascii.padding roomy as a blank line above and below each label (D77)', () => {
    const src = 'packet\n0-3: "a"\n4-7: "b"\n8-11: "c"';
    expect(text(src, { packet: { bitsPerRow: 8, showBits: false }, padding: 'roomy' })).toBe(
      lines(
        '┌───────┬───────┐',
        '│       │       │',
        '│   a   │   b   │',
        '│       │       │',
        '├───────┼───────┘',
        '│       │',
        '│   c   │',
        '│       │',
        '└───────┘'
      )
    );
    expect(text(src, { packet: { bitsPerRow: 8 }, padding: 'roomy' })).toBe(
      lines(
        ' 0     3 4     7',
        '┌───────┬───────┐',
        '│       │       │',
        '│   a   │   b   │',
        '│       │       │',
        '└───────┴───────┘',
        ' 8    11',
        '┌───────┐',
        '│       │',
        '│   c   │',
        '│       │',
        '└───────┘'
      )
    );
  });
});

describe('labels', () => {
  it('cuts a label to its field with an ellipsis, … in unicode and ~ in ascii', () => {
    const src = 'packet\n0: "Long"\n1-3: "Reserved"\n4-5: "ab"';
    const packet = { bitsPerRow: 8, showBits: false };
    expect(text(src, { packet }).split('\n')[1]).toBe('│…│Rese…│ab │');
    expect(text(src, { packet, charset: 'ascii' }).split('\n')[1]).toBe('|~|Rese~|ab |');
  });

  it('cuts in cells: a wide character that would not fit before the ellipsis goes', () => {
    const src = 'packet\n0-1: "顧客顧客"\n2-3: "顧"';
    expect(text(src, { packet: { bitsPerRow: 4, showBits: false } }).split('\n')[1]).toBe(
      '│顧…│顧 │'
    );
  });

  it('shows a label as core label layout reads it, its lines joined by a space', () => {
    const src = 'packet\n0-15: "one<br>two #amp; three"';
    expect(text(src, { packet: { bitsPerRow: 16, showBits: false } }).split('\n')[1]).toBe(
      '│        one two & three        │'
    );
  });

  it('draws an empty label as an empty box', () => {
    expect(text('packet\n0-1: ""', { packet: { showBits: false } })).toBe(
      lines('┌───┐', '│   │', '└───┘')
    );
  });
});

describe('title', () => {
  it('takes the in-text title over the front-matter one, centred on the drawing', () => {
    const src = '---\ntitle: Front\n---\npacket\ntitle Own\n0-3: "a"';
    expect(
      text(src, { packet: { showBits: false } })
        .split('\n')
        .at(-1)
    ).toBe('   Own');
  });

  it('starts a title wider than the drawing at the left edge, never cropped', () => {
    const src = 'packet\ntitle A rather long title\n0: "a"';
    expect(
      text(src, { packet: { showBits: false } })
        .split('\n')
        .at(-1)
    ).toBe('A rather long title');
  });

  it('wraps a title wider than ascii.maxWidth and the drawing, each line centred', () => {
    const src = 'packet\ntitle one two three four\n0-3: "a"';
    expect(
      text(src, { packet: { showBits: false }, maxWidth: 10 })
        .split('\n')
        .slice(3)
    ).toEqual([' one two', 'three four']);
  });
});

describe('warnings', () => {
  it('warns once about accTitle and accDescr, naming their statements', () => {
    const { warnings } = draw('packet\naccTitle: T\naccDescr: D\n0: "a"');
    expect(warnings.map((w) => [w.code, (w as { feature?: string }).feature])).toEqual([
      ['ASCII_DROPPED', 'accessibility'],
    ]);
    expect((warnings[0] as { astIds?: string[] }).astIds).toHaveLength(2);
  });

  it('warns once about bold and italic labels, naming their fields', () => {
    const { warnings, text: out } = draw('packet\n0-7: "<b>bold</b>"\n8-15: "<i>it</i>"\n16: "x"');
    expect(warnings.map((w) => (w as { astIds?: string[] }).astIds)).toEqual([
      ['field:0-7', 'field:8-15'],
    ]);
    expect(out).toContain(' bold ');
  });

  it('warns about a bold title too, naming its statement', () => {
    const { warnings } = draw('packet\ntitle <b>Bold</b>\n0-7: "<i>it</i>"');
    expect(
      warnings.map((w) => [
        (w as { feature?: string }).feature,
        (w as { astIds?: string[] }).astIds,
      ])
    ).toEqual([['emphasis', ['field:0-7', 'title']]]);
    const front = draw('---\ntitle: <b>Front</b>\n---\npacket\n0-7: "a"').warnings;
    expect(front.map((w) => (w as { astIds?: string[] }).astIds)).toEqual([[]]);
  });

  it('warns about nothing in a plain diagram, and ignores the px options without a word', () => {
    const src =
      '%%{init: {"packet": {"rowHeight": 64, "bitWidth": 8, "paddingX": 9, "paddingY": 9}}}%%\n' +
      UDP;
    const { warnings, text: out } = draw(src);
    expect(warnings).toEqual([]);
    expect(out).toBe(text(UDP));
  });
});

describe('text', () => {
  it('has no trailing spaces, only ASCII in ascii, and is deterministic', () => {
    const src = 'packet\ntitle T\n0-7: "a"\n8: "b"\n9-40: "split across"\n41-63: "c"';
    for (const charset of ['unicode', 'ascii'] as const) {
      const a = text(src, { charset });
      expect(a).not.toMatch(/ $/m);
      expect(text(src, { charset })).toBe(a);
      if (charset === 'ascii') expect(a).not.toMatch(/[^\x20-\x7e\n]/);
    }
  });
});
