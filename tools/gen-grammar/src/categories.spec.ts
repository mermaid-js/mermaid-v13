import { describe, expect, it } from 'vitest';
import { Kind, TOKEN_CATEGORIES } from '@mermaid-js/core/parser-kit';
import {
  detectFlowchart,
  flowchartTokens,
  FlowTokenKind as T,
} from '@mermaid-js/diagram-flowchart';
// The checked-in table, read from source: the package exports it from `./language` (#29),
// never from its main entry (the renderer's lazy chunk would keep it). The source view gives
// the spans the lexer removed (comments, directives, dropped `;`).
import { flowchartCategories } from '../../../packages/diagram-flowchart/src/generated/categories.ts';
import { flowSourceView } from '../../../packages/diagram-flowchart/src/parser/lexer.ts';
import { agreement, corpus, highlighters } from './agreement-testing.ts';
import { categoryTable, kindKeys } from './categories.ts';
import { parseGrammar } from './ebnf.ts';

describe('flowchart kind → category table', () => {
  it('gives every flowchart and shared kind a highlight category', () => {
    const kinds = [...Object.values(T), ...Object.values(Kind)];
    for (const k of kinds) expect(TOKEN_CATEGORIES, `kind ${k}`).toContain(flowchartCategories[k]);
    expect(Object.keys(flowchartCategories)).toHaveLength(kinds.length);
  });

  it('takes the category from the grammar file’s scopes', () => {
    expect(flowchartCategories[T.Graph]).toBe('Keyword');
    expect(flowchartCategories[T.Str]).toBe('String');
    expect(flowchartCategories[T.Link]).toBe('Operator');
    expect(flowchartCategories[T.Num]).toBe('Number');
    expect(flowchartCategories[T.CallbackName]).toBe('Function');
    expect(flowchartCategories[T.NodeString]).toBe('Variable');
    expect(flowchartCategories[T.Colon]).toBe('Other');
    // `}` closing shape data is an unnamed rule in the grammar file.
    expect(flowchartCategories[T.ShapeDataEnd]).toBe('Meta');
    // So is the `click` keyword before a click statement's node id.
    expect(flowchartCategories[T.ClickKeyword]).toBe('Keyword');
    // Shared kinds are fixed in the parser kit.
    expect(flowchartCategories[Kind.Comment]).toBe('Comment');
    expect(flowchartCategories[Kind.Directive]).toBe('Meta');
    expect(flowchartCategories[Kind.Newline]).toBe('Other');
  });
});

describe('category table generator', () => {
  const g = parseGrammar(`@lexer
@modes str ;
NODE_ID /[a-z]+/ :variable ;
<str> -  /"/    pop :string ;
<*> -    /"/    push(str) :string ;
NUM      /[0-9]+/ :number ;
NUM      /#[0-9]+/ :string ;
@grammar
s = { NODE_ID | NUM } ;
`);
  const source = {
    module: 'tokens.ts',
    object: 'K',
    unnamed: { Quote: { mode: 'str', pattern: '"' } },
    mixed: ['NUM'],
  };

  it('reads kind keys and matches them to rules by name, unnamed rules by mode and pattern', () => {
    const keys = kindKeys(
      "export const K = {\n  /** id: a */\n  NodeId: F, Num: F + 1, // x: y\n  'Quote': F + 2,\n} as const;",
      'K'
    );
    expect(keys).toEqual(['NodeId', 'Num', 'Quote']);
    expect(categoryTable(g, keys, source)).toEqual({
      entries: [
        ['NodeId', 'Variable'],
        ['Num', 'Number'],
        ['Quote', 'String'],
      ],
      mixed: ['NUM (Number, String)'],
    });
  });

  it('fails on a kind with no grammar rule, an unreadable entry or an unlisted mixed terminal', () => {
    expect(() => categoryTable(g, ['Arrow'], source)).toThrow(/kind Arrow matches no token rule/);
    expect(() => kindKeys('const x = 1;', 'K')).toThrow(/no `export const K/);
    expect(() => kindKeys('export const K = { A: F, ...B };', 'K')).toThrow(/cannot read/);
    expect(() => categoryTable(g, ['Num'], { ...source, mixed: [] })).toThrow(
      /NUM has rules of different scopes \(Number, String\); list it in kinds.mixed/
    );
  });
});

/**
 * Sources that exercise every kind the corpus lacks (and the regressions it missed): a
 * callback that must not run on to later lines, comments and directives inside a multi-line
 * `accDescr`, and a `%%` after a statement, which is node text, not a comment.
 */
const FIXTURES: [string, string][] = [
  ['no-dir', 'graph\n  A --> B'],
  ['callback', 'flowchart TD\n  click A call foo(x) "tip"\n  B-->C'],
  ['callback-empty', 'flowchart TD\n  click A call foo()\n  B-->C'],
  // The arguments open where `call` ends: the name's scope must not open and end in place.
  ['callback-no-name', 'flowchart TD\n  click A call (x) "tip"\n  B-->C'],
  ['href', 'flowchart TD\n  click A href "http://x" _blank\n  B-->C'],
  ['interpolate', 'flowchart TD\n  A-->B\n  linkStyle default interpolate basis'],
  [
    'acc-descr-multiline',
    'flowchart TD\n  accDescr {\n    hello\n    %% a comment\n    %%{init: {}}%%\n  }\n  A-->B',
  ],
  ['trailing-percent', 'flowchart TD\n  A --> B %% note\n  B --> C'],
  ['directive', 'flowchart TD\n  %%{init: {}}%%\n  %% a comment\n  B-->C'],
  ['props', 'flowchart TD\n  A[|a:b|] --> B'],
  ['tags', 'flowchart TB\n  * --> v\n  a < b\n  A ^ v B\n  A \\| B\n  A ->B'],
  ['unicode', 'flowchart TD\n  é --> ü\n  1*2 --> B'],
];

/** Kinds whose tokens are blanks or empty, so no highlighter colours them. */
const BLANK_KINDS = [T.Space, T.NoDir, T.Eof];

/*
 * The highlighters read the source as written, front matter included: all three model it
 * (front-matter.spec.ts). The lexer gives front matter no tokens, so only the diagram after it
 * is compared. Documented exceptions, where the highlighters see text differently from the
 * lexer:
 *
 * 1. `ShapeData`: one kind for all of `@{ … }`; the highlighters show its quoted values as
 *    String, the table (one category per kind) says Meta.
 *    Input: `A@{ label: "hi" }`.
 * 2. The `;` v12 dropped from the end of a `style` / `classDef` line (a `drop` hole of the
 *    lexer's source view) is part of the previous token's range but never read.
 *    Input: `style A fill:white;`.
 * Comment and directive holes are checked as the shared kinds `Comment` and `Directive`.
 */
describe('four-way highlighting agreement', () => {
  it('table, TextMate, Monarch and Lezer give every token the same category', async () => {
    const sources = corpus(detectFlowchart);
    expect(sources.length).toBeGreaterThan(400);
    const result = agreement(
      {
        kinds: T,
        categories: flowchartCategories,
        tokens: flowchartTokens,
        holes: (src, from, directives) => flowSourceView(src, from, directives).holes,
        exempt: (kind, _want, got) => kind === T.ShapeData && got === 'String',
      },
      await highlighters('flowchart'),
      [...FIXTURES, ...sources],
      BLANK_KINDS
    );
    expect(result.disagreements).toEqual({});
    // Embedded diagram blocks (ADR-15) are left out of the corpus: the generated grammars list
    // their tokens for the category table only and never enter the block mode (#671).
    const missing = result.missing.filter((k) => !k.startsWith('Embed'));
    expect(missing, 'kinds with no sample').toEqual([]);
  }, 120_000);
});
