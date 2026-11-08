/**
 * Venn highlighting (#498, language.md step 3): the four-way agreement of the kind → category
 * table with the generated TextMate, Monarch and Lezer grammars over the venn corpus, as
 * `kanban-agreement.spec.ts` checks kanban, on the corpus alone: the forms it needs are
 * `e2e/diagrams/venn/` fixtures (`nightly-check/highlighting/`). The grammar's `on` / `onBol` modes carry v12's
 * indent mode and give their tokens the same scopes as `INITIAL` / `bol`, so an indented `text`
 * line and a plain one colour alike.
 */
import { describe, expect, it } from 'vitest';
import {
  detectVenn,
  vennCategories,
  VennTokenKind as T,
  vennTokens,
} from '@mermaid-js/diagram-venn/language';
import { agreement, corpus, highlighters } from './agreement-testing.ts';

/** Kinds whose tokens are blanks or empty, so no highlighter colours them. */
const BLANK_KINDS: number[] = [T.Eof, T.IndentText];

describe('four-way highlighting agreement (venn)', () => {
  it('table, TextMate, Monarch and Lezer give every token the same category', async () => {
    const sources = corpus(detectVenn);
    expect(sources.length).toBeGreaterThan(20);
    const result = agreement(
      { kinds: T, categories: vennCategories, tokens: vennTokens },
      await highlighters('venn'),
      sources,
      BLANK_KINDS
    );
    expect(result.disagreements).toEqual({});
    expect(result.missing, 'kinds with no sample').toEqual([]);
  }, 120_000);
});
