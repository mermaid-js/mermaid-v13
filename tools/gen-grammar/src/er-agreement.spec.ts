/**
 * ER highlighting (#28, #190): the four-way agreement of the kind → category table with the
 * generated TextMate, Monarch and Lezer grammars over the ER corpus, as `categories.spec.ts`
 * checks flowchart.
 */
import { describe, expect, it } from 'vitest';
import {
  detectEr,
  erCategories,
  ErTokenKind as T,
  erTokens,
} from '@mermaid-js/diagram-er/language';
import { agreement, corpus, highlighters } from './agreement-testing.ts';

/** Sources for the kinds the corpus lacks (and the regressions it found). */
const FIXTURES: [string, string][] = [
  ['acc-descr', 'erDiagram\n  accDescr {\n    multi\n  }\n  A'],
  ['style-semi', 'erDiagram\n  A\n  style A fill:red;stroke:blue'],
  ['comments', 'erDiagram\n  %% a comment\n  %%{init: {}}%%\n  A'],
  ['multi-line directive', 'erDiagram\n  %%{\n    init: {}\n  }%%\n  A ||--o{ B : x'],
  // A `,` between keys is v12's `.` token, uncoloured.
  ['keys', 'erDiagram\n  A {\n    int id PK, FK\n  }'],
];

/** Kinds whose tokens are blanks or empty, so no highlighter colours them. */
const BLANK_KINDS: number[] = [T.Eof];

describe('four-way highlighting agreement (ER)', () => {
  it('table, TextMate, Monarch and Lezer give every token the same category', async () => {
    const sources = corpus(detectEr);
    expect(sources.length).toBeGreaterThan(100);
    const result = agreement(
      { kinds: T, categories: erCategories, tokens: erTokens },
      await highlighters('er'),
      [...FIXTURES, ...sources],
      BLANK_KINDS
    );
    expect(result.disagreements).toEqual({});
    expect(result.missing, 'kinds with no sample').toEqual([]);
  }, 120_000);
});
