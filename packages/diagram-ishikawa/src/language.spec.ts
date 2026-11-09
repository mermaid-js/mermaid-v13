import { describe, expect, it } from 'vitest';
import { ishikawaLanguage, language, parseIshikawa } from './language.ts';

/**
 * The ishikawa language facet (#584) at its own seam: completions at a probe parse and hover
 * over a plain parse, as the language service calls them. The service-level behaviour
 * (definition, references, rename, folding, semantic tokens, diagnostics) is in the goldens
 * (`packages/language-service/goldens/ishikawa`).
 */
const CURSOR = '¦';

function split(marked: string): [text: string, at: number] {
  const at = marked.indexOf(CURSOR);
  return [marked.slice(0, at) + marked.slice(at + 1), at];
}

/** Completion labels at `¦`, with the text each replaces. */
function complete(marked: string): string[] {
  const [text, at] = split(marked);
  const result = ishikawaLanguage.parse(text, { keepTokens: true, probe: at });
  return ishikawaLanguage
    .completions(result.probe!, { text, result })
    .map((c) => `${c.label} <- ${JSON.stringify(text.slice(c.range.start, c.range.end))}`);
}

/** Hover at `¦` as `<hovered text> => <contents>`, given the token the service would pass. */
function hover(marked: string): string | undefined {
  const [text, at] = split(marked);
  const result = ishikawaLanguage.parse(text, { keepTokens: true });
  const tokens = result.tokens!;
  let token: { kind: number; range: { start: number; end: number } } | undefined;
  for (let i = 0; i < tokens.length; i++) {
    const start = tokens.start[i]!;
    const end = tokens.end[i]!;
    if (/\S/.test(text.slice(start, end)) && start <= at && at <= end)
      token ??= { kind: tokens.kind[i]!, range: { start, end } };
  }
  const symbol = result.symbols.find((s) => s.range.start <= at && at <= s.range.end);
  const h = ishikawaLanguage.hover(
    { offset: at, ...(token ? { token } : {}), ...(symbol ? { symbol } : {}) },
    { text, result }
  );
  return h && `${text.slice(h.range.start, h.range.end)} => ${h.contents}`;
}

const PHOTO =
  'ishikawa\nBlurry Photo\n  Process\n    Out of focus\n  User\n    Shaky\n    Low light\n  Gear\n';

const at = (word: string, k = 2) => PHOTO.replace(word, word.slice(0, k) + CURSOR + word.slice(k));

describe('ishikawa language facet', () => {
  it('is the ishikawa facet under the fixed name `language`, causes standalone (D497)', () => {
    expect(ishikawaLanguage.id).toBe('ishikawa');
    expect(language).toBe(ishikawaLanguage);
    expect(ishikawaLanguage.namespaces).toEqual([['cause']]);
    expect(ishikawaLanguage.standalone).toEqual(['cause']);
  });

  it('completes the header keywords only, where the header goes', () => {
    expect(complete('¦')).toEqual(['ishikawa <- ""', 'ishikawa-beta <- ""']);
    expect(complete('Ishi¦')).toEqual(['ishikawa <- "Ishi"', 'ishikawa-beta <- "Ishi"']);
    expect(complete('ishikawa-b¦')).toEqual(['ishikawa-beta <- "ishikawa-b"']);
    expect(complete('%% note\n\n¦')).toEqual(['ishikawa <- ""', 'ishikawa-beta <- ""']);
    // The body is free text: nothing after the header.
    expect(complete('ishikawa\n¦')).toEqual([]);
    expect(complete('ishikawa\n  Eff¦')).toEqual([]);
    expect(complete('ishikawa\nEffect\n  ¦')).toEqual([]);
    expect(complete('ishikawa\nEffect\n  Cause ¦\n')).toEqual([]);
    expect(complete('---\ntitle: x¦\n---\nishikawa\n')).toEqual([]);
  });

  it('hovers a cause with its depth, parent, side and sub-causes, the effect with its causes', () => {
    expect(hover(at('Blurry'))).toBe(
      'Blurry Photo => **effect** `Blurry Photo`\n\nThe head of the fish · 3 causes, 6 with their sub-causes'
    );
    expect(hover(at('Process'))).toBe(
      'Process => **cause** `Process`\n\nDepth 1, a top-level cause, above the spine · 1 sub-cause'
    );
    expect(hover(at('User'))).toBe(
      'User => **cause** `User`\n\nDepth 1, a top-level cause, below the spine · 2 sub-causes'
    );
    expect(hover(at('Shaky'))).toBe(
      'Shaky => **cause** `Shaky`\n\nDepth 2, under `User`, below the spine · no sub-causes'
    );
    expect(hover(at('Gear', 4))).toBe(
      'Gear => **cause** `Gear`\n\nDepth 1, a top-level cause, above the spine · no sub-causes'
    );
    expect(hover('ishikawa\nNo causes¦\n')).toBe(
      'No causes => **effect** `No causes`\n\nThe head of the fish · no causes'
    );
    expect(hover('ishi¦kawa-beta\nE\n')).toMatch(
      /^ishikawa-beta => \*\*`ishikawa-beta`\*\*\n\n`ishikawa-beta` or/
    );
    expect(hover('ishikawa\nE\n  A\n¦\n')).toBeUndefined();
  });

  it('hovers a cause the baseline clamp made top-level (D496)', () => {
    expect(hover('ishikawa\nE\n    A\n  B¦\n')).toBe(
      'B => **cause** `B`\n\nDepth 1, a top-level cause, below the spine · no sub-causes\n\nIndented less than the first cause, so read as a top-level cause (mermaid@12 does the same).'
    );
  });

  it('reads the clamp from the parse, per cause or from the one warning (D496)', () => {
    const text = 'ishikawa\nE\n    A\n  B\n  C\n';
    const offset = text.indexOf('C');
    for (const result of [
      ishikawaLanguage.parse(text, { keepTokens: true }),
      parseIshikawa(text, { keepTokens: true }),
    ]) {
      const h = ishikawaLanguage.hover({ offset }, { text, result });
      expect(h?.contents).toMatch(/Indented less than the first cause/);
      const first = ishikawaLanguage.hover({ offset: text.indexOf('A') }, { text, result });
      expect(first?.contents).not.toMatch(/Indented less/);
    }
  });

  it('gives each clamped cause an information diagnostic, where a render warns once (D496)', () => {
    const text = 'ishikawa\nE\n    A\n  B\n  C\n';
    const facet = ishikawaLanguage.parse(text, { keepTokens: true }).diagnostics;
    expect(facet.map((d) => [d.severity, d.code, text.slice(d.range.start, d.range.end)])).toEqual([
      ['info', 'ISHIKAWA_INDENT_CLAMPED', 'B'],
      ['info', 'ISHIKAWA_INDENT_CLAMPED', 'C'],
    ]);
    expect(facet[0]!.message).toBe(
      'Indented less than the first cause (`A` at line 3), so read as a top-level cause. Indent it at least as deep as the first cause to nest it.'
    );
    const render = parseIshikawa(text).diagnostics;
    expect(render.map((d) => [d.severity, d.code])).toEqual([
      ['warning', 'ISHIKAWA_INDENT_CLAMPED'],
    ]);
  });

  it('refuses a rename to a name holding a source line break (D497); `<br>` is one cause', () => {
    for (const name of ['two\nlines', 'two\r\nlines', 'two\rlines', 'two\n'])
      expect(ishikawaLanguage.isValidId(name, 'cause'), JSON.stringify(name)).toBe(
        'A cause is one line: it cannot hold a line break.'
      );
    // A `<br>` is a break in the drawn label, not in the source: v12 reads one cause.
    expect(ishikawaLanguage.isValidId('two<br>lines', 'cause')).toBeUndefined();
    expect(ishikawaLanguage.isValidId('two<br/>lines', 'cause')).toBeUndefined();
  });

  it('accepts a cause name that reads back as that cause, and says why not otherwise (D497)', () => {
    const why = (name: string, kind?: string) => ishikawaLanguage.isValidId(name, kind);
    for (const ok of [
      'New label',
      'ishikawas',
      'The ishikawa way',
      'a %% b',
      'Cost <br> time',
      'x;',
    ])
      expect(why(ok), ok).toBeUndefined();
    expect(why('a\nb')).toBe('A cause is one line: it cannot hold a line break.');
    expect(why('a\u2028b')).toBe('A cause is one line: it cannot hold a line break.');
    expect(why('ishikawa way')).toMatch(/^A cause cannot start with `ishikawa`/);
    expect(why('Ishikawa-beta')).toMatch(/^A cause cannot start with `ishikawa`/);
    expect(why(' x')).toMatch(/^A cause cannot start or end with a blank/);
    expect(why('')).toBe('A cause cannot be empty: a blank line is no cause.');
    expect(why('%% x')).toBe('A cause cannot start with `%%`: the line would be a comment.');
    expect(why('a %%{init: {}}%% b')).toBe("'a %%{init: {}}%% b' would not read as that cause.");
    expect(why('x', 'node')).toBe("'node' is not an ishikawa symbol kind.");
  });
});
