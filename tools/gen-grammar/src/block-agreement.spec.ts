/**
 * Block highlighting (#557, language.md step 3): the four-way agreement of the kind → category
 * table with the generated TextMate, Monarch and Lezer grammars over the block corpus, as
 * `kanban-agreement.spec.ts` checks kanban.
 */
import { describe, expect, it } from 'vitest';
import {
  blockCategories,
  BlockTokenKind as T,
  blockTokens,
  detectBlock,
} from '@mermaid-js/diagram-block/language';
import { agreement, corpus, highlighters } from './agreement-testing.ts';

/** Sources for the kinds the corpus lacks. */
const FIXTURES: [string, string][] = [
  [
    'shapes',
    'block\n  a["A"] b("B") c(("C")) d((("D"))) e(["E"]) f[["F"]] g[("G")]\n  h{"H"} i{{"I"}} j>"J"] k[/"K"/] l[\\"L"\\] m[/"M"\\] n[\\"N"/]\n',
  ],
  ['block arrows', 'block\n  a<["A"]>(right, left) b<["B"]>(x,y) c<["C"]>( up , down )\n'],
  [
    'links',
    'block\n  a --> b --- c --x d --o e <--> f ==> g -.-> h\n  a -- "label" --> b\n  c == "thick" ==> d\n',
  ],
  [
    'sizes',
    'block-beta\n  columns auto\n  a:2 space space:3\n  block:g:2\n    columns 2\n    b\n  end\n  block\n    c\n  end\n',
  ],
  [
    'styles',
    'block\n  a b\n  classDef hot fill:#f96,stroke:#333\n  classDef DEFAULT fill:#f00\n  class a,b hot\n  style a fill:#9f6\n',
  ],
  ['markdown', 'block\n  a["`**md**`"]\n'],
  ['reserved', 'block\n  default linkStyle interpolate\n'],
  [
    'accessibility',
    'block\n  accTitle: A title\n  accDescr: A description\n  accDescr {\n    multi\n  }\n  a\n',
  ],
  ['comments', 'block\n  %% a comment\n  %%{init: {}}%%\n  a\n'],
];

/** Kinds whose tokens are blanks or empty, so no highlighter colours them. */
const BLANK_KINDS: number[] = [T.Eof];

describe('four-way highlighting agreement (block)', () => {
  it('table, TextMate, Monarch and Lezer give every token the same category', async () => {
    const sources = corpus(detectBlock);
    expect(sources.length).toBeGreaterThan(20);
    const result = agreement(
      { kinds: T, categories: blockCategories, tokens: blockTokens },
      await highlighters('block'),
      [...FIXTURES, ...sources],
      BLANK_KINDS
    );
    expect(result.disagreements).toEqual({});
    expect(result.missing, 'kinds with no sample').toEqual([]);
  }, 120_000);
});
