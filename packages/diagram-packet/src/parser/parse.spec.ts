import { describe, expect, it } from 'vitest';
import { parsePacket } from './parser.ts';
import { T } from './tokens.ts';

/** Expected values are mermaid\@12.2.0's `getPacket()` and DB getters for the same text. */
describe('parsePacket', () => {
  it('reads `start-end`, `start` and `+bits` fields into one row', () => {
    const { model, diagnostics } = parsePacket('packet\n0-10: "a"\n11: "b"\n+4: \'c\'');
    expect(diagnostics).toEqual([]);
    expect(model.fields).toEqual([
      { start: 0, end: 10, bits: 11, label: 'a', astId: 'field:0-10' },
      { start: 11, end: 11, bits: 1, label: 'b', astId: 'field:11-11' },
      { start: 12, end: 15, bits: 4, label: 'c', astId: 'field:12-15' },
    ]);
    expect(model.rows).toEqual([
      [
        { field: 0, start: 0, end: 10 },
        { field: 1, start: 11, end: 11 },
        { field: 2, start: 12, end: 15 },
      ],
    ]);
    expect(model.bitsPerRow).toBe(32);
  });

  it('splits a field at each row end, as v12 does (`11-90` in rows of 32)', () => {
    const { model } = parsePacket('packet\n0-10: "a"\n11-90: "b"');
    expect(model.rows.map((r) => r.map((p) => [p.field, p.start, p.end]))).toEqual([
      [
        [0, 0, 10],
        [1, 11, 31],
      ],
      [[1, 32, 63]],
      [[1, 64, 90]],
    ]);
    expect(model.fields[1]).toMatchObject({ start: 11, end: 90, bits: 80 });
  });

  it('splits at the configured bitsPerRow', () => {
    const { model, diagnostics } = parsePacket('packet\n0-15: "a"', { config: { bitsPerRow: 8 } });
    expect(diagnostics).toEqual([]);
    expect(model.bitsPerRow).toBe(8);
    expect(model.rows).toEqual([
      [{ field: 0, start: 0, end: 7 }],
      [{ field: 0, start: 8, end: 15 }],
    ]);
  });

  it('reads a numeric string bitsPerRow as its number, as v12 coerced it', () => {
    const { model, diagnostics } = parsePacket('packet\n0-15: "a"', {
      config: { bitsPerRow: '8' },
    });
    expect(diagnostics).toEqual([]);
    expect(model.rows).toHaveLength(2);
  });

  for (const [key, value] of [
    ['bitsPerRow', 0],
    ['bitsPerRow', -4],
    ['bitsPerRow', 10.5],
    ['bitsPerRow', 'eight'],
    ['rowHeight', 0],
    ['bitWidth', 0.5],
    ['paddingX', -1],
    ['paddingY', null],
  ] as const) {
    it(`falls back to the default for ${key}: ${JSON.stringify(value)}, with one warning (D342)`, () => {
      const { model, diagnostics } = parsePacket('packet\n0-15: "a"', { config: { [key]: value } });
      expect(diagnostics.map((d) => [d.severity, d.code])).toEqual([
        ['warning', 'PACKET_CONFIG_INVALID'],
      ]);
      expect(diagnostics[0]?.message).toContain(`packet.${key}`);
      expect(model.warnings).toEqual(diagnostics);
      expect(model.bitsPerRow).toBe(32);
      expect(model.rows).toEqual([[{ field: 0, start: 0, end: 15 }]]);
    });
  }

  it('keeps v12 10,000-row cap and warns once when fields are dropped (D342)', () => {
    const { model, diagnostics } = parsePacket('packet\n0-99999999: "a"\n+1: "b"\n+1: "c"');
    expect(model.rows).toHaveLength(10_000);
    expect(model.rows.at(-1)).toEqual([{ field: 0, start: 319_968, end: 319_999 }]);
    // `b` and `c` have no piece left, so they are not in the model.
    expect(model.fields.map((f) => f.label)).toEqual(['a']);
    expect(diagnostics.map((d) => [d.severity, d.code])).toEqual([['warning', 'PACKET_TRUNCATED']]);
    expect(model.warnings).toEqual(diagnostics);
  });

  it('gives no warning when the text ends exactly at the cap', () => {
    const { model, diagnostics } = parsePacket('packet\n0-319999: "a"');
    expect(model.rows).toHaveLength(10_000);
    expect(diagnostics).toEqual([]);
  });

  it('reports each misplaced field once, with v12 messages, and goes on (D341)', () => {
    const src = 'packet\n0-10: "a"\n12: "b"\n13-20: "c"\n25-21: "d"\n26: "e"\n+0: "f"\n27: "g"';
    const { model, diagnostics } = parsePacket(src);
    expect(
      diagnostics.map((d) => [d.code, d.message, src.slice(d.range.start, d.range.end)])
    ).toEqual([
      [
        'PACKET_NOT_CONTIGUOUS',
        'Packet block 12 - 12 is not contiguous. It should start from 11.',
        '12',
      ],
      [
        'PACKET_END_BEFORE_START',
        'Packet block 25 - 21 is invalid. End must be greater than start.',
        '25-21',
      ],
      ['PACKET_ZERO_BITS', 'Packet block 27 is invalid. Cannot have a zero bit field.', '+0'],
    ]);
    // A misplaced field is not in the model; the fields after it are.
    expect(model.fields.map((f) => f.label)).toEqual(['a', 'c', 'e', 'g']);
  });

  it('names a gap with v12 range text (`18 - 18` for one bit)', () => {
    const { diagnostics } = parsePacket('packet\n0-10: "a"\n18: "b"\n19-20: "c"');
    expect(diagnostics.map((d) => d.message)).toEqual([
      'Packet block 18 - 18 is not contiguous. It should start from 11.',
    ]);
  });

  it('converts labels as v12 did: either quote, `\\x` unescaped, not trimmed, over lines', () => {
    const { model } = parsePacket(
      'packet\n0: "a\\"b\\nq"\n1: \'  pad  \'\n2: "a\\tb\\x\\\\"\n3: "multi\nline"'
    );
    expect(model.fields.map((f) => f.label)).toEqual([
      'a"b\nq',
      '  pad  ',
      'a\tbx\\',
      'multi\nline',
    ]);
  });

  it('marks a label written as a markdown string, which keeps its backticks as in v12 (#1368)', () => {
    const { model } = parsePacket(
      'packet\n0: "`**a**`"\n1: \'`b`\'\n2: "**c** *d*"\n3: "`e` f"\n4: "`g`h`"'
    );
    expect(model.fields.map((f) => [f.label, f.markdown])).toEqual([
      ['`**a**`', true],
      ['`b`', true],
      ['**c** *d*', undefined],
      ['`e` f', undefined],
      ['`g`h`', undefined],
    ]);
  });

  it('reads title, accTitle and accDescr as v12 did', () => {
    const { model } = parsePacket(
      'packet\naccTitle:  a   b \naccDescr {\n  a   b\n\n  c \n}\ntitle  x   y \n0: "a"'
    );
    expect(model).toMatchObject({ title: 'x y', accTitle: 'a b', accDescr: 'a b\nc' });
  });

  it('takes the front-matter title when the text has none or an empty one (D218)', () => {
    expect(parsePacket('---\ntitle: FM\n---\npacket\n0: "a"').model.title).toBe('FM');
    expect(parsePacket('---\ntitle: FM\n---\npacket\ntitle x\ntitle\n0: "a"').model.title).toBe(
      'FM'
    );
    expect(parsePacket('---\ntitle: FM\n---\npacket\ntitle x\n0: "a"').model.title).toBe('x');
    expect(parsePacket('packet\n0: "a"').model).not.toHaveProperty('title');
  });

  it('gives fields ids from their resolved range, and repeats `@n` (D345)', () => {
    const { ast } = parsePacket(
      'packet-beta\ntitle t\n0-7: "a"\n+8: "b"\n8: "c"\ntitle u\naccTitle: x\naccDescr: y'
    );
    expect(ast.children.map((n) => n.id)).toEqual([
      'packet',
      'title',
      'field:0-7',
      'field:8-15',
      'field:8-8',
      'title@2',
      'accTitle',
      'accDescr',
    ]);
    expect(ast.children[0]).toMatchObject({ type: 'Header', beta: true });
  });
});

describe('parsePacket field nodes (T6)', () => {
  const dropped = (src: string, config?: Record<string, unknown>) =>
    parsePacket(src, { config }).ast.children.flatMap((n) =>
      n.type === 'Field' ? [n.dropped] : []
    );

  it('say why a field is not drawn: the D341 check that failed, with its message', () => {
    expect(dropped('packet\n0-7: "a"\n9-12: "b"\n+0: "z"\n15-14: "r"\n16: "c"')).toEqual([
      undefined,
      {
        reason: 'error',
        code: 'PACKET_NOT_CONTIGUOUS',
        message: 'Packet block 9 - 12 is not contiguous. It should start from 8.',
      },
      {
        reason: 'error',
        code: 'PACKET_ZERO_BITS',
        message: 'Packet block 13 is invalid. Cannot have a zero bit field.',
      },
      {
        reason: 'error',
        code: 'PACKET_END_BEFORE_START',
        message: 'Packet block 15 - 14 is invalid. End must be greater than start.',
      },
      undefined,
    ]);
  });

  it('say a field wholly past the row cap is not drawn, and a field it cuts is (D342)', () => {
    const src = 'packet\n0-9998: "a"\n9999-10001: "cut"\n10002: "past"';
    expect(dropped(src, { bitsPerRow: 1 })).toEqual([undefined, undefined, { reason: 'rowCap' }]);
    expect(dropped(src)).toEqual([undefined, undefined, undefined]);
  });
});

describe('parsePacket probe (T6, R-LANG-7)', () => {
  const probe = (marked: string) => {
    const at = marked.indexOf('¦');
    const src = marked.slice(0, at) + marked.slice(at + 1);
    return parsePacket(src, { probe: at }).probe;
  };

  it('names where the probe is: code, or inside a label or a statement value', () => {
    const mode = (marked: string) => probe(marked)?.mode;
    expect(mode('¦')).toBe('INITIAL');
    expect(mode('packet\n  tit¦')).toBe('INITIAL');
    expect(mode('packet\n  title TC¦P')).toBe('title');
    expect(mode('packet\n  accTitle: x¦')).toBe('accTitle');
    expect(mode('packet\n  accDescr {\n  a¦\n}')).toBe('accDescr');
    expect(mode('packet\n  accDescr {\n  a\n}¦')).toBe('INITIAL');
    expect(mode('packet\n  0-15: "So¦urce"')).toBe('string');
    expect(mode('packet\n  0-15: "So¦')).toBe('string');
    expect(mode('packet\n  0-15: "Source"¦')).toBe('INITIAL');
    expect(mode('packet\n  %% a ¦comment')).toBe('comment');
  });

  it('follows `+`, `-` and `:`: right after them the parser expects bits or a label', () => {
    expect(probe('packet\n  +¦')).toMatchObject({ expected: [T.Int], prefix: { start: 10 } });
    expect(probe('packet\n  0-¦')).toMatchObject({ expected: [T.Int], prefix: { start: 11 } });
    expect(probe('packet\n  0-15:¦')).toMatchObject({ expected: [T.String] });
  });

  it('expects a field, `+` or a statement at a line start, and `-` or `:` after a start bit', () => {
    expect(probe('packet\n¦')?.expected).toEqual(
      expect.arrayContaining([T.Int, T.Plus, T.Title, T.AccTitle, T.AccDescr])
    );
    expect(probe('packet\n  16 ¦')?.expected).toEqual([T.Dash, T.Colon]);
    expect(probe('packet\n  0-15 ¦')?.expected).toEqual([T.Colon]);
  });
});
