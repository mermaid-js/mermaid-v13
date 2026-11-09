/**
 * Sankey highlighting (#504, language.md step 3): the four-way agreement of the kind →
 * category table with the generated TextMate, Monarch and Lezer grammars over the sankey
 * corpus, as `pie-agreement.spec.ts` checks pie.
 */
import { describe, expect, it } from 'vitest';
import {
  detectSankey,
  sankeyCategories,
  SankeyTokenKind as T,
  sankeyTokens,
} from '@mermaid-js/diagram-sankey/language';
import { agreement, corpus, highlighters } from './agreement-testing.ts';

/** Sources for the kinds the corpus lacks. */
const FIXTURES: [string, string][] = [
  ['quoted', 'sankey\n"Oil, ""crude""",Electricity,1\nCoal,"Heat",2\n'],
  ['comments', 'sankey\n%% a comment\n%%{init: {}}%%\nCoal,Heat,1\n'],
  ['beta', 'sankey-beta\n\nCoal,Heat,1\n'],
];

/** Kinds whose tokens are empty, so no highlighter colours them. */
const BLANK_KINDS: number[] = [T.Eof];

describe('four-way highlighting agreement (sankey)', () => {
  it('table, TextMate, Monarch and Lezer give every token the same category', async () => {
    const sources = corpus(detectSankey);
    expect(sources.length).toBeGreaterThan(10);
    const result = agreement(
      { kinds: T, categories: sankeyCategories, tokens: sankeyTokens },
      await highlighters('sankey'),
      [...FIXTURES, ...sources],
      BLANK_KINDS
    );
    expect(result.disagreements).toEqual({});
    expect(result.missing, 'kinds with no sample').toEqual([]);
  }, 120_000);
});
