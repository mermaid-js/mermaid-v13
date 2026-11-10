/**
 * Agentflow highlighting (#549, language.md step 3): the four-way agreement of the kind →
 * category table with the generated TextMate, Monarch and Lezer grammars over the agentflow
 * corpus and fixtures, as `categories.spec.ts` checks flowchart's.
 */
import { describe, expect, it } from 'vitest';
import { Kind, TOKEN_CATEGORIES } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import {
  agentflowCategories,
  agentflowTokens,
  AgentflowTokenKind as T,
  detectAgentflow,
} from '@mermaid-js/diagram-agentflow/language';
// The lexer's source view gives the spans it removed (directives, dropped `;`).
import { agentflowSourceView } from '../../../packages/diagram-agentflow/src/parser/source.ts';
import { agreement, corpus, highlighters } from './agreement-testing.ts';

/** Sources for the kinds the corpus lacks. */
const FIXTURES: [string, string][] = [
  ['no-dir', 'agentflow-beta\n  a --> b'],
  ['callback', 'agentflow-beta TD\n  click a call foo(x) "tip"\n  b-->c'],
  ['callback-empty', 'agentflow-beta TD\n  click a call foo()\n  b-->c'],
  ['href', 'agentflow-beta TD\n  click a href "http://x" _blank\n  b-->c'],
  ['interpolate', 'agentflow-beta TD\n  a-->b\n  linkStyle default interpolate basis'],
  ['acc-descr-multiline', 'agentflow-beta TD\n  accDescr {\n    hello\n  }\n  a-->b'],
  ['acc-title', 'agentflow-beta TD\n  accTitle: The title\n  accDescr: The description\n  a-->b'],
  ['directive', 'agentflow-beta TD\n  %%{init: {}}%%\n  %% a comment\n  b-->c'],
  ['props', 'agentflow-beta TD\n  a[|a:b|] --> b'],
  [
    'blocks',
    'agentflow-beta LR\n  connector c[Hub]\n  flow f[F]@{ view: collapsed }\n    direction TB\n    a --x b\n    b -.- c\n  end\n  global\n    g\n  end',
  ],
  ['edge-text', 'agentflow-beta LR\n  a -- "why" --> b\n  a -->|`md`| b\n  a e1@--> b'],
  [
    'shapes',
    'agentflow-beta LR\n  a((x)) --> b(((y)))\n  c([s]) --> d[[t]]\n  e[(c)] --> f>o]\n  g{d} --> h{{x}}\n  i[/l/] --> j[\\l\\]\n  k[/t\\] --> l[\\i/]\n  m(-e-)',
  ],
  [
    'styles',
    'agentflow-beta LR\n  classDef hot fill:#f00,color:#fff\n  a:::hot\n  class a,b hot\n  style a fill:#f9f;\n  linkStyle 0,1 stroke:red',
  ],
  ['unicode', 'agentflow-beta TD\n  é --> ü\n  1*2 --> B'],
  ['md-string', 'agentflow-beta TD\n  a["`**md**`"] --> b'],
  [
    'directions',
    'agentflow-beta TD\n  flow f\n    direction BT\n  end\n  flow g\n    direction LR\n  end\n  flow h\n    direction TD\n  end',
  ],
  ['semicolons', 'agentflow-beta TD\n  a --> b; b --> c;'],
  ['tags', 'agentflow-beta TB\n  * --> v\n  a < b\n  A ^ v B\n  A \\| B\n  A ->B'],
  ['comments', 'agentflow-beta TB\n  %% a line\n  a --> b %% after'],
];

/**
 * Kinds with no sample: tokens that are blanks or empty, so no highlighter colours them, and
 * the shared `Comment`, which agentflow's lexer gives only a `%%` inside a label (jison skips
 * it there) and `agentflowTokens` leaves out; a `%%` comment elsewhere is the significant
 * `T.Comment` (v12's grammar reads it), which is compared.
 */
const BLANK_KINDS = [T.Space, T.NoDir, T.Eof, Kind.Comment];

describe('agentflow kind → category table', () => {
  it('gives every agentflow and shared kind a highlight category', () => {
    const kinds = [...Object.values(T), ...Object.values(Kind)];
    for (const k of kinds) expect(TOKEN_CATEGORIES, `kind ${k}`).toContain(agentflowCategories[k]);
    expect(Object.keys(agentflowCategories)).toHaveLength(kinds.length);
  });
});

/*
 * As flowchart's (D467), the documented exceptions where the highlighters see text differently
 * from the lexer: `ShapeData` is one kind for all of `@{ … }`, whose quoted values the
 * highlighters show as String and the table (one category per kind) as Meta; the `;` v12
 * dropped from the end of a `style` / `classDef` line is part of the previous token's range but
 * never read. Directive holes are checked as the shared kind `Directive`. A `%%` comment is a
 * significant `Comment` token (v12's grammar reads it).
 */
describe('four-way highlighting agreement (agentflow)', () => {
  it('table, TextMate, Monarch and Lezer give every token the same category', async () => {
    // v12's detector reads the text after the front matter, comments removed.
    const body = (src: string) => src.slice(preprocess(src).bodyStart).replace(/^(\s*%%.*\n)*/, '');
    const sources = corpus((src) => detectAgentflow(body(src)));
    expect(sources.length).toBeGreaterThan(50);
    const result = agreement(
      {
        kinds: T,
        categories: agentflowCategories,
        tokens: agentflowTokens,
        holes: (src, from, directives) => agentflowSourceView(src, from, directives).holes,
        exempt: (kind, _want, got) => kind === T.ShapeData && got === 'String',
      },
      await highlighters('agentflow'),
      [...FIXTURES, ...sources],
      BLANK_KINDS
    );
    expect(result.disagreements).toEqual({});
    expect(result.missing, 'kinds with no sample').toEqual([]);
  }, 120_000);
});
