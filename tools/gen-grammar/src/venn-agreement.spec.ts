/**
 * Venn highlighting (#498, language.md step 3): the four-way agreement of the kind → category
 * table with the generated TextMate, Monarch and Lezer grammars over the venn corpus, as
 * `kanban-agreement.spec.ts` checks kanban. The grammar's `on` / `onBol` modes carry v12's
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

/** Sources for the kinds and modes the corpus lacks. */
const FIXTURES: [string, string][] = [
  [
    'labels and sizes',
    'venn-beta\n  set A["Alpha"]:10\n  set B[ spaced ]:+2.5\n  union A,B[Both]:.5\n',
  ],
  [
    'indented text',
    'venn-beta\n  set A\n    text a1\n\n    %% kept on\n    text 12\n  union A,A\n    text "q"["L"]\n  title T\n  text A t1\n',
  ],
  [
    'style values',
    'venn-beta\n  set A\n  style A fill: #f00, stroke: rgb(1, 2, 3), color: rgba(0,0,0,0.5), stroke-width: 2 px, fill-opacity: "0.3"\n',
  ],
  ['comments', 'venn-beta\n  %% a comment\n  %%{init: {}}%%\n  set A %% after\n  set "B b"\n'],
  ['one line', 'venn-beta set A set B union A,B'],
];

/** Kinds whose tokens are blanks or empty, so no highlighter colours them. */
const BLANK_KINDS: number[] = [T.Eof, T.IndentText];

describe('four-way highlighting agreement (venn)', () => {
  it('table, TextMate, Monarch and Lezer give every token the same category', async () => {
    const sources = corpus(detectVenn);
    expect(sources.length).toBeGreaterThan(20);
    const result = agreement(
      { kinds: T, categories: vennCategories, tokens: vennTokens },
      await highlighters('venn'),
      [...FIXTURES, ...sources],
      BLANK_KINDS
    );
    expect(result.disagreements).toEqual({});
    expect(result.missing, 'kinds with no sample').toEqual([]);
  }, 120_000);
});
