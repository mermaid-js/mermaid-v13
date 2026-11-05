/**
 * Class highlighting (#28, #190): the four-way agreement of the kind → category table with the
 * generated TextMate, Monarch and Lezer grammars over the class corpus, as
 * `categories.spec.ts` checks flowchart.
 */
import { describe, expect, it } from 'vitest';
import {
  classCategories,
  ClassTokenKind as T,
  classTokens,
  detectClass,
} from '@mermaid-js/diagram-class/language';
import { agreement, corpus, highlighters } from './agreement-testing.ts';

/** Sources for the kinds the corpus lacks. */
const FIXTURES: [string, string][] = [
  ['acc-descr', 'classDiagram\n  accDescr {\n    multi\n  }\n  class A'],
  ['edge-state', 'classDiagram\n  [*] --> A'],
  [
    'click',
    'classDiagram\n  click A call foo(x) "tip"\n  click B href "http://x" _blank\n  link C "u" _self',
  ],
  ['open-in-struct', 'classDiagram\n  class A {\n    {x}\n  }'],
  ['punctuation', 'classDiagram\n  class A-1\n  class a = b\n  +\n  #\n  %\n  A:\n  A,B'],
  ['multi-line directive', 'classDiagram\n  %%{\n    init: { "theme": "dark" }\n  }%%\n  class A'],
];

/**
 * Kinds no highlighter colours: blanks and empty tokens, and `Num`, which the lexer never
 * gives (a run of `\w` is `Alpha` first, as in v12's jison).
 */
const BLANK_KINDS: number[] = [T.Space, T.Eof, T.EofInStruct, T.Num];

describe('four-way highlighting agreement (class)', () => {
  it('table, TextMate, Monarch and Lezer give every token the same category', async () => {
    const sources = corpus(detectClass);
    expect(sources.length).toBeGreaterThan(100);
    const result = agreement(
      { kinds: T, categories: classCategories, tokens: classTokens },
      await highlighters('class'),
      [...FIXTURES, ...sources],
      BLANK_KINDS
    );
    expect(result.disagreements).toEqual({});
    expect(result.missing, 'kinds with no sample').toEqual([]);
  }, 120_000);
});
