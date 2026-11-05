import { describe, expect, it } from 'vitest';
import { language, pieLanguage } from './language.ts';

/**
 * The pie language facet (#307) at its own seam: completions at a probe parse and hover over a
 * plain parse, as the language service calls them. The service-level behaviour (rename with
 * quotes, folding, semantic tokens) is in the goldens (`packages/language-service/goldens/pie`).
 */
const CURSOR = '¦';

function split(marked: string): [text: string, at: number] {
  const at = marked.indexOf(CURSOR);
  return [marked.slice(0, at) + marked.slice(at + 1), at];
}

/** Completion labels at `¦`. */
function complete(marked: string): string[] {
  const [text, at] = split(marked);
  const result = pieLanguage.parse(text, { keepTokens: true, probe: at });
  return pieLanguage.completions(result.probe!, { text, result }).map((c) => c.label);
}

/** Hover at `¦`, given the token and symbol the service would pass. */
function hover(marked: string): string | undefined {
  const [text, at] = split(marked);
  const result = pieLanguage.parse(text, { keepTokens: true });
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
  return pieLanguage.hover({ offset: at, token, symbol }, { text, result })?.contents;
}

describe('pie language facet', () => {
  it('is the pie facet, exported under the fixed name `language`', () => {
    expect(pieLanguage.id).toBe('pie');
    expect(language).toBe(pieLanguage);
    expect(pieLanguage.namespaces).toEqual([['slice']]);
  });

  it('parses with the tokens kept and a category for every token kind it emits', () => {
    const text = 'pie showData\n  title Pets\n  "Dogs" : 386\n  accDescr: x\n';
    const result = pieLanguage.parse(text, { keepTokens: true });
    expect(result.diagnostics).toEqual([]);
    const kinds = [...result.tokens!.kind.slice(0, result.tokens!.length)];
    expect(kinds.map((k) => pieLanguage.categories[k])).not.toContain(undefined);
    expect(result.symbols.map((s) => `${s.kind}:${s.name}`)).toEqual(['slice:Dogs']);
  });
});

describe('pie completions (D95)', () => {
  it('offers `pie` in an empty text', () => {
    expect(complete('¦')).toEqual(['pie']);
    expect(complete('p¦')).toEqual(['pie']);
  });

  it('offers `showData` and `title` after `pie`', () => {
    expect(complete('pie ¦')).toEqual(['showData', 'title']);
    expect(complete('pie sh¦')).toEqual(['showData']);
    expect(complete('pie showData ¦')).toEqual(['title']);
  });

  it('offers the statements and a label at the start of a line', () => {
    expect(complete('pie\n  ¦')).toEqual(['title', 'accTitle', 'accDescr', '"']);
    expect(complete('pie\n  "Dogs" : 3\n¦')).toEqual(['title', 'accTitle', 'accDescr', '"']);
    expect(complete('pie\n  acc¦')).toEqual(['accTitle', 'accDescr']);
  });

  it('offers `:` after a label', () => {
    expect(complete('pie\n  "Dogs" ¦')).toEqual([':']);
    expect(complete('pie\n  "Dogs"¦')).toEqual([':']);
  });

  it('offers nothing in a label, a value or a statement text', () => {
    expect(complete('pie\n  "Do¦gs" : 3')).toEqual([]);
    expect(complete('pie\n  "Do¦')).toEqual([]);
    expect(complete('pie\n  "Dogs" : ¦')).toEqual([]);
    expect(complete('pie\n  title Pe¦')).toEqual([]);
    expect(complete('pie\n  accTitle: ¦')).toEqual([]);
    expect(complete('pie\n  accDescr {\n  a ¦\n  }')).toEqual([]);
    expect(complete('pie\n  %% a ¦comment')).toEqual([]);
  });

  it('replaces the whole word being typed', () => {
    const text = 'pie\n  titxx';
    const result = pieLanguage.parse(text, { keepTokens: true, probe: 9 });
    const [item] = pieLanguage.completions(result.probe!, { text, result });
    expect(item).toMatchObject({
      label: 'title',
      insertText: 'title ',
      range: { start: 6, end: 11 },
    });
  });
});

describe('pie hover (D93)', () => {
  it('shows the keyword docs of the grammar file', () => {
    expect(hover('p¦ie')).toMatch(/^\*\*`pie`\*\*\n\n`pie`: starts a pie chart/);
    expect(hover('pie show¦Data')).toMatch(/legend shows each value/);
    expect(hover('pie\n  tit¦le Pets')).toMatch(/title drawn above the chart/);
    expect(hover('pie\n  title Pe¦ts')).toBeUndefined();
    expect(hover('pie\n  acc¦Title: x')).toMatch(/accessible title/);
    expect(hover('pie\n  acc¦Descr {\n x\n }')).toMatch(/accessible description/);
  });

  it("shows a slice's value and share", () => {
    const text = 'pie\n  "Do¦gs" : 3\n  "Cats" : 1\n';
    expect(hover(text)).toBe('**slice** `Dogs`\n\nValue: 3 · 75% of 4');
    expect(hover('pie\n  "Dogs" : 3\n  "Cats" : 1¦\n')).toBe(
      '**slice** `Cats`\n\nValue: 1 · 25% of 4'
    );
  });

  it('says a repeated label keeps the first value, and a negative one is left out', () => {
    expect(hover('pie\n  "Dogs" : 3\n  "Do¦gs" : 5\n')).toBe(
      '**slice** `Dogs`\n\nValue: 3 · 100% of 3\n\nRepeated: this value, 5, is ignored and the first is kept.'
    );
    expect(hover('pie\n  "Dogs" : -¦3\n')).toMatch(/Negative values are not allowed/);
  });
});

describe('pie isValidId (rename, D92)', () => {
  it.each(['Dogs', 'Cats and dogs', ' padded ', 'café', '42', "it's"])('accepts %j', (name) => {
    expect(pieLanguage.isValidId(name, 'slice')).toBeUndefined();
  });

  it.each([
    ['', /empty/],
    ['a\nb', /line break/],
    ['a"b', /`"`/],
    ['a\\b', /`\\`/],
  ])('rejects %j with a reason', (name, reason) => {
    expect(pieLanguage.isValidId(name, 'slice')).toMatch(reason);
  });
});
