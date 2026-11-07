import { describe, expect, it } from 'vitest';
import { language, packetLanguage } from './language.ts';

/**
 * The packet language facet (#458) at its own seam: completions at a probe parse and hover over
 * a plain parse, as the language service calls them. The service-level behaviour (rename with
 * quotes, folding, semantic tokens) is in the goldens (`packages/language-service/goldens/packet`).
 */
const CURSOR = '¦';

function split(marked: string): [text: string, at: number] {
  const at = marked.indexOf(CURSOR);
  return [marked.slice(0, at) + marked.slice(at + 1), at];
}

/** Completion labels at `¦`. */
function complete(marked: string): string[] {
  const [text, at] = split(marked);
  const result = packetLanguage.parse(text, { keepTokens: true, probe: at });
  return packetLanguage.completions(result.probe!, { text, result }).map((c) => c.label);
}

/** Hover at `¦`, given the token and symbol the service would pass. */
function hover(marked: string): string | undefined {
  const [text, at] = split(marked);
  const result = packetLanguage.parse(text, { keepTokens: true });
  const tokens = result.tokens!;
  // The service's token: a non-blank one containing the offset, else one ending at it.
  let token: { kind: number; range: { start: number; end: number } } | undefined;
  let touching: typeof token;
  for (let i = 0; i < tokens.length; i++) {
    const start = tokens.start[i]!;
    const end = tokens.end[i]!;
    if (!/\S/.test(text.slice(start, end))) continue;
    if (start <= at && at < end) token = { kind: tokens.kind[i]!, range: { start, end } };
    else if (end === at) touching = { kind: tokens.kind[i]!, range: { start, end } };
  }
  token ??= touching;
  // The service's occurrence: the text between the quotes.
  const s = result.symbols.find((x) => x.range.start < at && at < x.range.end);
  const symbol = s && { ...s, range: { start: s.range.start + 1, end: s.range.end - 1 } };
  return packetLanguage.hover({ offset: at, token, symbol }, { text, result })?.contents;
}

describe('packet language facet', () => {
  it('is the packet facet, exported under the fixed name `language`', () => {
    expect(packetLanguage.id).toBe('packet');
    expect(language).toBe(packetLanguage);
    expect(packetLanguage.namespaces).toEqual([['field']]);
    // D346: repeated labels are separate fields, each its own symbol.
    expect(packetLanguage.standalone).toEqual(['field']);
  });

  it('parses with the tokens kept and a category for every token kind it emits', () => {
    const text = 'packet\n  title TCP\n  0-15: "Source Port"\n  +16: \'Data\'\n  accDescr: x\n';
    const result = packetLanguage.parse(text, { keepTokens: true });
    expect(result.diagnostics).toEqual([]);
    const kinds = [...result.tokens!.kind.slice(0, result.tokens!.length)];
    expect(kinds.map((k) => packetLanguage.categories[k])).not.toContain(undefined);
    expect(result.symbols.map((s) => `${s.kind}:${s.name}`)).toEqual([
      'field:Source Port',
      'field:Data',
    ]);
  });
});

describe('packet completions (D95)', () => {
  it('offers `packet` in an empty text', () => {
    expect(complete('¦')).toEqual(['packet']);
    expect(complete('pa¦')).toEqual(['packet']);
  });

  it('offers only `title` on the `packet` line', () => {
    expect(complete('packet ¦')).toEqual(['title']);
    expect(complete('packet-beta ¦')).toEqual(['title']);
  });

  it('offers the statements, `+` and the next start bit at the start of a line', () => {
    expect(complete('packet\n  ¦')).toEqual(['title', 'accTitle', 'accDescr', '+', '0']);
    expect(complete('packet\n  0-15: "a"\n  ¦')).toEqual([
      'title',
      'accTitle',
      'accDescr',
      '+',
      '16',
    ]);
    expect(complete('packet\n  0-15: "a"\n  +8: "b"\n¦')).toContain('24');
    expect(complete('packet\n  0-15: "a"\n  1¦')).toEqual(['16']);
    expect(complete('packet\n  acc¦')).toEqual(['accTitle', 'accDescr']);
  });

  it('counts the next bit as v12 does: after the fields above the cursor only', () => {
    expect(complete('packet\n  0-7: "a"\n  ¦\n  8-15: "b"')).toContain('8');
    // `+0` moves nothing on; a reversed range moves the count past its start (v12's `lastBit`).
    expect(complete('packet\n  0-7: "a"\n  +0: "z"\n  ¦')).toContain('8');
    expect(complete('packet\n  0-7: "a"\n  12-10: "r"\n  ¦')).toContain('13');
    // A field whose bits were read moves the count on, though its label is broken.
    expect(complete('packet\n  0-7: "a"\n  8-15 "no colon"\n  ¦')).toContain('16');
    expect(complete('packet\n  0-7: "a"\n  +8: unquoted\n  ¦')).toContain('16');
    expect(complete('packet\n  +0: "z"\n  ¦')).toContain('0');
    expect(complete('packet\n  0-7: "a" %% c\n  title T\n  ¦')).toContain('8');
    // `8 "b"` is out of place (13 was next) but its bits are read: the count goes on from 8.
    expect(complete('packet\n  0-7: "a" x\n  12-10: "r"\n  8 "b"\n  ¦')).toContain('9');
  });

  it('offers `:` after a range and `"` after the `:`', () => {
    expect(complete('packet\n  0-15 ¦')).toEqual([':']);
    expect(complete('packet\n  16 ¦')).toEqual([':']);
    expect(complete('packet\n  +8 ¦')).toEqual([':']);
    expect(complete('packet\n  0-15:¦')).toEqual(['"']);
    expect(complete('packet\n  0-15: ¦')).toEqual(['"']);
  });

  it('offers nothing in a range being typed, a label, a statement text or outside code', () => {
    expect(complete('packet\n  +¦')).toEqual([]);
    expect(complete('packet\n  0-¦')).toEqual([]);
    expect(complete('packet\n  0-15: "So¦urce"')).toEqual([]);
    expect(complete('packet\n  0-15: "So¦')).toEqual([]);
    expect(complete('packet\n  0-15: "a" ¦')).toEqual([]);
    expect(complete('packet\n  title TC¦')).toEqual([]);
    expect(complete('packet\n  accTitle: ¦')).toEqual([]);
    expect(complete('packet\n  accDescr {\n  a ¦\n  }')).toEqual([]);
    expect(complete('packet\n  %% a ¦comment')).toEqual([]);
  });

  it('replaces the whole word being typed', () => {
    const text = 'packet\n  titxx';
    const result = packetLanguage.parse(text, { keepTokens: true, probe: 12 });
    const [item] = packetLanguage.completions(result.probe!, { text, result });
    expect(item).toMatchObject({
      label: 'title',
      insertText: 'title ',
      range: { start: 9, end: 14 },
    });
  });
});

describe('packet hover (D93)', () => {
  it('shows the keyword docs of the grammar file', () => {
    expect(hover('pa¦cket')).toMatch(/^\*\*`packet`\*\*\n\n`packet`: starts a packet diagram/);
    expect(hover('packet-b¦eta')).toMatch(/older name of `packet`/);
    expect(hover('packet\n  tit¦le TCP')).toMatch(/title drawn below the rows/);
    expect(hover('packet\n  title TC¦P')).toBeUndefined();
    expect(hover('packet\n  acc¦Title: x')).toMatch(/accessible title/);
    expect(hover('packet\n  acc¦Descr {\n x\n }')).toMatch(/accessible description/);
  });

  it("shows a field's resolved range and width, on its bits or its label", () => {
    const text = 'packet\n  0-15: "Source Port"\n  +1¦6: "Destination Port"\n';
    expect(hover(text)).toBe('**field** `Destination Port`\n\nBits 16-31 · 16 bits');
    expect(hover('packet\n  0-15: "Sou¦rce Port"')).toBe(
      '**field** `Source Port`\n\nBits 0-15 · 16 bits'
    );
    expect(hover('packet\n  0¦: "flag"')).toBe('**field** `flag`\n\nBit 0 · 1 bit');
  });

  it("applies the row cap at the source's own `bitsPerRow`: front matter or directive", () => {
    const body = 'packet\n  0-9999: "a"\n  10000: "b¦"';
    const capped = '**field** `b`\n\nNot drawn: it lies past the 10000-row limit of a packet.';
    expect(hover(body)).toBe('**field** `b`\n\nBit 10000 · 1 bit');
    expect(hover(`---\nconfig:\n  packet:\n    bitsPerRow: 1\n---\n${body}`)).toBe(capped);
    expect(hover(`%%{init: {"packet": {"bitsPerRow": 1}}}%%\n${body}`)).toBe(capped);
  });

  it('says a field with a semantic error is not drawn, with the reason', () => {
    expect(hover('packet\n  0-7: "a"\n  9-1¦2: "b"')).toBe(
      '**field** `b`\n\nNot drawn: Packet block 9 - 12 is not contiguous. It should start from 8.'
    );
    expect(hover('packet\n  +¦0: "z"')).toBe(
      '**field** `z`\n\nNot drawn: Packet block 0 is invalid. Cannot have a zero bit field.'
    );
  });
});
