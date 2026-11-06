/**
 * Cynefin highlighting (#470, language.md step 3): the four-way agreement of the kind → category
 * table with the generated TextMate, Monarch and Lezer grammars over the cynefin corpus, as
 * `pie-agreement.spec.ts` checks pie.
 */
import { describe, expect, it } from 'vitest';
import {
  cynefinCategories,
  CynefinTokenKind as T,
  cynefinTokens,
  detectCynefin,
} from '@mermaid-js/diagram-cynefin/language';
import { agreement, corpus, highlighters } from './agreement-testing.ts';

/**
 * Where TextMate and Monarch, which read a line at a time, cannot follow two tokens that run
 * over line breaks (Lezer, which runs the patterns, agrees): an item written over lines, and a
 * `---` … `---` block inside the body (v12's skipped YAML token). Pie's gaps, over the same
 * `common.langium` tokens; the corpus has neither, only these fixtures do. The block
 * `accDescr { … }` is written as a span and agrees.
 */
const LINE_BASED = Object.fromEntries(
  ['Monarch', 'TextMate'].flatMap((h) => [
    [`${h}: String is String, highlighted Other`, 'multi-line item at 23'],
    [`${h}: Yaml is Meta, highlighted Other`, 'yaml in the body at 13'],
    [`${h}: Yaml is Meta, highlighted Punctuation`, 'yaml in the body at 18'],
  ])
);

/** Sources for the kinds the corpus lacks. */
const FIXTURES: [string, string][] = [
  ['acc', 'cynefin-beta\n  accTitle: T\n  accDescr: one line\n  accDescr {\n    multi\n  }\n'],
  ['header colon', 'cynefin-beta: x\n  complex "a"\n'],
  ['quotes', `cynefin-beta\n  complex 'Probe' "a\\"b"\n  complex --> clear : 'x'\n`],
  ['comments', 'cynefin-beta\n  %% a comment\n  %%{init: {}}%%\n  complex "a" %% after\n'],
  ['multi-line directive', 'cynefin-beta\n  %%{\n    init: {}\n  }%%\n  clear "a"'],
  ['title', 'cynefin-beta\n  title Incident %% c\n  title  Two  words'],
  ['multi-line item', 'cynefin-beta\n  complex "multi\nline" "b"'],
  ['yaml in the body', 'cynefin-beta\n---\nx: 1\n---\n  complex "a"'],
];

describe('four-way highlighting agreement (cynefin)', () => {
  it('table, TextMate, Monarch and Lezer give every token the same category', async () => {
    const sources = corpus(detectCynefin);
    expect(sources.length).toBeGreaterThan(10);
    const result = agreement(
      { kinds: T, categories: cynefinCategories, tokens: cynefinTokens },
      await highlighters('cynefin'),
      [...FIXTURES, ...sources]
    );
    expect(result.disagreements).toEqual(LINE_BASED);
    expect(result.missing, 'kinds with no sample').toEqual([]);
  }, 120_000);
});
