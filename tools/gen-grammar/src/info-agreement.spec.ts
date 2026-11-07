/**
 * Info highlighting (#420, language.md step 3): the four-way agreement of the kind → category
 * table with the generated TextMate, Monarch and Lezer grammars over the info corpus, as
 * `pie-agreement.spec.ts` checks pie.
 */
import { describe, expect, it } from 'vitest';
import {
  detectInfo,
  infoCategories,
  InfoTokenKind as T,
  infoTokens,
} from '@mermaid-js/diagram-info/language';
import { agreement, corpus, highlighters } from './agreement-testing.ts';

/**
 * Where TextMate and Monarch, which read a line at a time, cannot follow a `---` … `---` block
 * inside the body (v12's skipped YAML token; its optional middle cannot be written as one
 * `begin[\s\S]*?end` span); Lezer, which runs the patterns, agrees. The corpus has none, only
 * the fixture below does. The block `accDescr { … }` is written as a span and agrees.
 */
const LINE_BASED = Object.fromEntries(
  ['Monarch', 'TextMate'].flatMap((h) => [
    [`${h}: Yaml is Meta, highlighted Other`, 'yaml in the body at 5'],
  ])
);

/** Sources for the kinds the corpus lacks. */
const FIXTURES: [string, string][] = [
  ['acc', 'info\n  accTitle: Version\n  accDescr: one line\n  accDescr {\n    multi\n  }\n'],
  ['comments', 'info\n  %% a comment\n  %%{init: {}}%%\n  showInfo %% after\n'],
  ['multi-line directive', 'info\n  %%{\n    init: {}\n  }%%\n  showInfo'],
  ['yaml in the body', 'info\n---\nx: 1\n---\n  title t'],
  ['title', 'info showInfo title Version %% c\n  title  Two  words'],
];

describe('four-way highlighting agreement (info)', () => {
  it('table, TextMate, Monarch and Lezer give every token the same category', async () => {
    const sources = corpus(detectInfo);
    expect(sources.length).toBeGreaterThan(2);
    const result = agreement(
      { kinds: T, categories: infoCategories, tokens: infoTokens },
      await highlighters('info'),
      [...FIXTURES, ...sources]
    );
    expect(result.disagreements).toEqual(LINE_BASED);
    expect(result.missing, 'kinds with no sample').toEqual([]);
  }, 120_000);
});
