/**
 * Pie highlighting (#307, language.md step 3): the four-way agreement of the kind → category
 * table with the generated TextMate, Monarch and Lezer grammars over the pie corpus, as
 * `er-agreement.spec.ts` checks ER.
 */
import { describe, expect, it } from 'vitest';
import {
  detectPie,
  pieCategories,
  PieTokenKind as T,
  pieTokens,
} from '@mermaid-js/diagram-pie/language';
import { agreement, corpus, highlighters } from './agreement-testing.ts';

/**
 * Where TextMate and Monarch, which read a line at a time, cannot follow two tokens that run
 * over line breaks (Lezer, which runs the patterns, agrees): a label written over lines, and a
 * `---` … `---` block inside the body (v12's skipped YAML token; its optional middle cannot be
 * written as one `begin[\s\S]*?end` span). Both are rare: the corpus has neither, and only
 * these fixtures do. The block `accDescr { … }` is written as a span and agrees.
 */
const LINE_BASED = Object.fromEntries(
  ['Monarch', 'TextMate'].flatMap((h) => [
    [`${h}: String is String, highlighted Other`, 'quotes at 34'],
    [`${h}: Yaml is Meta, highlighted Number`, 'yaml in the body at 11'],
    [`${h}: Yaml is Meta, highlighted Other`, 'yaml in the body at 4'],
    [`${h}: Yaml is Meta, highlighted Punctuation`, 'yaml in the body at 9'],
  ])
);

/** Sources for the kinds the corpus lacks. */
const FIXTURES: [string, string][] = [
  ['acc', 'pie\n  accTitle: Pets\n  accDescr: one line\n  accDescr {\n    multi\n  }\n'],
  ['quotes', `pie\n  'Dogs' : 1\n  "a\\"b" : 2.5\n  "multi\nline" : 3`],
  ['comments', 'pie\n  %% a comment\n  %%{init: {}}%%\n  "a" : 1 %% after\n'],
  ['multi-line directive', 'pie\n  %%{\n    init: {}\n  }%%\n  "a" : 1'],
  ['yaml in the body', 'pie\n---\nx: 1\n---\n  "a" : 1'],
  ['title', 'pie showData title Pets %% c\n  title  Two  words'],
];

describe('four-way highlighting agreement (pie)', () => {
  it('table, TextMate, Monarch and Lezer give every token the same category', async () => {
    const sources = corpus(detectPie);
    expect(sources.length).toBeGreaterThan(20);
    const result = agreement(
      { kinds: T, categories: pieCategories, tokens: pieTokens },
      await highlighters('pie'),
      [...FIXTURES, ...sources]
    );
    expect(result.disagreements).toEqual(LINE_BASED);
    expect(result.missing, 'kinds with no sample').toEqual([]);
  }, 120_000);
});
