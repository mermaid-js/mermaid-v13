/**
 * Ishikawa highlighting (#584, language.md step 3): the four-way agreement of the kind →
 * category table with the generated TextMate, Monarch and Lezer grammars over the ishikawa
 * corpus, as `kanban-agreement.spec.ts` checks kanban.
 */
import { describe, expect, it } from 'vitest';
import {
  detectIshikawa,
  ishikawaCategories,
  IshikawaTokenKind as T,
  ishikawaTokens,
} from '@mermaid-js/diagram-ishikawa/language';
import { agreement, corpus, highlighters } from './agreement-testing.ts';

/** Sources for the kinds the corpus lacks. */
const FIXTURES: [string, string][] = [
  ['header line', 'ishikawa-beta Effect on the header line\n  A\n'],
  ['comments', 'ishikawa %% after the keyword\n  Effect\n  %% a comment\n  A %% kept\n\n  B\n'],
  ['bare comment', 'ishikawa\nEffect\n  A\n%%\n  B\n'],
  ['directive', '%%{init: {"theme": "forest"}}%%\nishikawa\n  Effect\n    A\n'],
];

/** Kinds whose tokens are blanks or empty, so no highlighter colours them. */
const BLANK_KINDS: number[] = [T.Eof, T.SpaceList, T.SpaceLine];

describe('four-way highlighting agreement (ishikawa)', () => {
  it('table, TextMate, Monarch and Lezer give every token the same category', async () => {
    const sources = corpus(detectIshikawa);
    expect(sources.length).toBeGreaterThan(20);
    const result = agreement(
      { kinds: T, categories: ishikawaCategories, tokens: ishikawaTokens },
      await highlighters('ishikawa'),
      [...FIXTURES, ...sources],
      BLANK_KINDS
    );
    expect(result.disagreements).toEqual({});
    expect(result.missing, 'kinds with no sample').toEqual([]);
  }, 120_000);
});
