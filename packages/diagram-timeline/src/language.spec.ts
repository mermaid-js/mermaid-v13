import { describe, expect, it } from 'vitest';
import { language, timelineLanguage } from './language.ts';

/**
 * The timeline language facet (#318) at its own seam: completions at a probe parse and hover
 * over a plain parse, as the language service calls them. The service-level behaviour
 * (folding, semantic tokens, the empty symbol queries and refused rename of D259) is in the
 * goldens (`packages/language-service/goldens/timeline`).
 */
const CURSOR = '¦';

function split(marked: string): [text: string, at: number] {
  const at = marked.indexOf(CURSOR);
  return [marked.slice(0, at) + marked.slice(at + 1), at];
}

/** Completion labels at `¦`. */
function complete(marked: string): string[] {
  const [text, at] = split(marked);
  const result = timelineLanguage.parse(text, { keepTokens: true, probe: at });
  return timelineLanguage.completions(result.probe!, { text, result }).map((c) => c.label);
}

/** The text each item at `¦` replaces, and what it inserts. */
function edits(marked: string): [string, string][] {
  const [text, at] = split(marked);
  const result = timelineLanguage.parse(text, { keepTokens: true, probe: at });
  return timelineLanguage
    .completions(result.probe!, { text, result })
    .map((c) => [text.slice(c.range.start, c.range.end), c.insertText]);
}

/** Hover at `¦` as `<hovered text> => <contents>`, given the token the service would pass. */
function hover(marked: string): string | undefined {
  const [text, at] = split(marked);
  const result = timelineLanguage.parse(text, { keepTokens: true });
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
  const h = timelineLanguage.hover({ offset: at, token }, { text, result });
  return h && `${text.slice(h.range.start, h.range.end)} => ${h.contents}`;
}

const STATEMENTS = ['title', 'section', 'accTitle', 'accDescr'];

describe('timeline language facet', () => {
  it('is the timeline facet under the fixed name `language`, with no symbols (D259)', () => {
    expect(timelineLanguage.id).toBe('timeline');
    expect(language).toBe(timelineLanguage);
    expect(timelineLanguage.namespaces).toEqual([]);
    expect(timelineLanguage.isValidId('2002')).toMatch(/nothing to rename/);
  });

  it('parses with the tokens kept, a category for every token kind, and no symbols', () => {
    const text =
      'timeline TD\n  title History\n  section A\n  2002 : x : y\n  accTitle: t\n  accDescr {\n    d\n  }\n';
    const result = timelineLanguage.parse(text, { keepTokens: true });
    expect(result.diagnostics).toEqual([]);
    const kinds = [...result.tokens!.kind.slice(0, result.tokens!.length)];
    expect(kinds.map((k) => timelineLanguage.categories[k])).not.toContain(undefined);
    expect(result.symbols).toEqual([]);
  });
});

describe('timeline completions (D95)', () => {
  it('offers the header in an empty text', () => {
    expect(complete('¦')).toEqual(['timeline', 'timeline LR', 'timeline TD']);
    expect(complete('time¦')).toEqual(['timeline', 'timeline LR', 'timeline TD']);
  });

  it('offers the directions after `timeline`, on its line', () => {
    expect(complete('timeline ¦')).toEqual(['LR', 'TD']);
    expect(complete('timeline ¦\n')).toEqual(['LR', 'TD']);
    expect(complete('timeline ¦\n  2002 : a')).toEqual(['LR', 'TD']);
    expect(complete('timeline l¦')).toEqual(['LR']);
    expect(complete('timeline T¦')).toEqual(['TD']);
    expect(complete('timeline\n¦')).toEqual(STATEMENTS);
    expect(complete('timeline LR ¦')).toEqual([]);
  });

  it('offers the statements at the start of a line', () => {
    expect(complete('timeline\n  ¦')).toEqual(STATEMENTS);
    expect(complete('timeline\n  2002 : a\n  ¦\n  2003 : b')).toEqual(STATEMENTS);
    expect(complete('timeline\n  sec¦')).toEqual(['section']);
    expect(complete('timeline\n  acc¦')).toEqual(['accTitle', 'accDescr']);
    expect(complete('timeline\n  ACC¦')).toEqual(['accTitle', 'accDescr']);
  });

  it('replaces the word being typed, to its end', () => {
    expect(edits('timeline\n  se¦c')).toEqual([['sec', 'section ']]);
    expect(edits('timeline\n  ¦')).toEqual([
      ['', 'title '],
      ['', 'section '],
      ['', 'accTitle: '],
      ['', 'accDescr: '],
    ]);
    expect(edits('timeline T¦')).toEqual([['T', 'TD']]);
  });

  it('offers nothing in a period, an event, a title, a section name or a value', () => {
    expect(complete('timeline\n  20¦')).toEqual([]);
    expect(complete('timeline\n  2002 ¦')).toEqual([]);
    expect(complete('timeline\n  2002 : Link¦')).toEqual([]);
    expect(complete('timeline\n  2002 : a ¦')).toEqual([]);
    expect(complete('timeline\n  title ¦')).toEqual([]);
    expect(complete('timeline\n  title Hist¦')).toEqual([]);
    expect(complete('timeline\n  section W¦')).toEqual([]);
    expect(complete('timeline\n  accTitle: a¦')).toEqual([]);
    expect(complete('timeline\n  accDescr {\n  ¦\n  }')).toEqual([]);
  });

  it('offers nothing outside code', () => {
    expect(complete('timeline\n  %% a ¦comment\n')).toEqual([]);
    expect(complete('---\ntitle: ¦x\n---\ntimeline\n')).toEqual([]);
    expect(complete('timeline\n  %%{init: {¦}}%%\n')).toEqual([]);
  });

  it('still offers the statements after an error', () => {
    expect(complete('timeline\n  2002 : : x\n  ¦')).toEqual(STATEMENTS);
  });
});

describe('timeline hover (D93)', () => {
  it('shows the keyword doc from the grammar', () => {
    expect(hover('time¦line\n')).toMatch(/^timeline => \*\*`timeline`\*\*\n\nA timeline is/);
    expect(hover('timeline T¦D\n')).toMatch(/^timeline TD => \*\*`timeline TD`\*\*/);
    expect(hover('timeline\n  acc¦Title: t\n')).toMatch(/^accTitle: => .*accessible title/s);
    expect(hover('timeline\n  accDescr ¦{\n  d\n  }')).toMatch(/^accDescr \{ => /);
  });

  it('shows only the keyword of `title` and `section`, not their text', () => {
    expect(hover('timeline\n  ti¦tle History\n')).toMatch(
      /^title => \*\*`title`\*\*\n\n`title <text>`/
    );
    expect(hover('timeline\n  sec¦tion Web\n')).toMatch(/^section => .*starts a section/s);
    expect(hover('timeline\n  section ¦Web\n')).toBeUndefined();
    expect(hover('timeline\n  title His¦tory\n')).toBeUndefined();
  });

  it('shows nothing for periods, events and values', () => {
    expect(hover('timeline\n  20¦02 : x\n')).toBeUndefined();
    expect(hover('timeline\n  2002 : ¦x\n')).toBeUndefined();
    expect(hover('timeline\n  accTitle: ¦t\n')).toBeUndefined();
  });
});
