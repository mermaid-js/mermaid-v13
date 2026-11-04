import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Kind, TOKEN_CATEGORIES } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
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
import { categoryTable, kindKeys } from './categories.ts';
import { parseGrammar } from './ebnf.ts';
import { generate, generatedDir } from './generate.ts';
import { lezerCategorise, monarchCategorise, textMateCategorise } from './highlight-testing.ts';
import type { Categorise } from './highlight-testing.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const files = generate((p) => readFileSync(join(root, p), 'utf8'));
const out = (name: string) => files.get(`${generatedDir('flowchart')}/${name}`) ?? '';

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

function mmdFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) return mmdFiles(join(dir, e.name));
    return e.name.endsWith('.mmd') ? [join(dir, e.name)] : [];
  });
}

/**
 * Sources that exercise every kind the corpus lacks (and the regressions it missed): a
 * callback that must not run on to later lines, comments and directives inside a multi-line
 * `accDescr`, and a `%%` after a statement, which is node text, not a comment.
 */
const FIXTURES: [string, string][] = [
  ['no-dir', 'graph\n  A --> B'],
  ['callback', 'flowchart TD\n  click A call foo(x) "tip"\n  B-->C'],
  ['callback-empty', 'flowchart TD\n  click A call foo()\n  B-->C'],
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
const BLANK_KINDS = new Set<number>([T.Space, T.NoDir, T.Eof]);

/**
 * Documented exceptions, where the highlighters see text differently from the lexer:
 *
 * 1. Front matter: the lexer gives it no tokens, so it is blanked before highlighting. Monarch
 *    models it (monarch-front-matter.spec.ts); TextMate and Lezer do not yet (GAPS.md).
 * 2. `ShapeData`: one kind for all of `@{ … }`; the highlighters show its quoted values as
 *    String, the table (one category per kind) says Meta.
 *    Input: `A@{ label: "hi" }`.
 * 3. The `;` v12 dropped from the end of a `style` / `classDef` line (a `drop` hole of the
 *    lexer's source view) is part of the previous token's range but never read.
 *    Input: `style A fill:white;`.
 * Comment and directive holes are checked as the shared kinds `Comment` and `Directive`.
 */
const blankFrontMatter = (src: string) => {
  const end = preprocess(src).bodyStart;
  return src.slice(0, end).replace(/[^\n]/g, ' ') + src.slice(end);
};

/**
 * The kind of each character of `src` as the lexer sees it: its tokens, and the comments and
 * directives it removed (a directive wins over a comment hole that runs over it).
 */
function lexerKinds(src: string): Map<number, number> {
  const pre = preprocess(src);
  const view = flowSourceView(
    src,
    pre.bodyStart,
    pre.directives.map((d) => d.range)
  );
  const kinds = new Map<number, number>();
  const set = (start: number, end: number, kind: number | undefined) => {
    for (let i = start; i < end; i++) {
      if (kind === undefined) kinds.delete(i);
      else kinds.set(i, kind);
    }
  };
  for (const t of flowchartTokens(src)) set(t.range.start, t.range.end, t.kind);
  for (const h of view.holes) if (h.kind !== 'directive') set(h.start, h.end, undefined);
  for (const h of view.holes) if (h.kind === 'comment') set(h.start, h.end, Kind.Comment);
  for (const d of pre.directives) set(d.range.start, d.range.end, Kind.Directive);
  return kinds;
}

const NAMES: Record<number, string> = {
  ...Object.fromEntries(Object.entries(T).map(([k, v]) => [v, k])),
  [Kind.Comment]: 'Comment',
  [Kind.Directive]: 'Directive',
};

describe('four-way highlighting agreement', () => {
  it('table, TextMate, Monarch and Lezer give every token the same category', async () => {
    const highlighters: [string, Categorise][] = [
      [
        'TextMate',
        await textMateCategorise(out('flowchart.tmLanguage.json'), 'source.mermaid-flowchart'),
      ],
      ['Monarch', monarchCategorise(out('flowchart.monarch.json'))],
      [
        'Lezer',
        await lezerCategorise(
          out('flowchart.grammar'),
          out('flowchart.tokens.js'),
          'flowchart',
          join(root, 'tools/gen-grammar/node_modules/.cache/lezer-categories')
        ),
      ],
    ];
    const corpus = mmdFiles(join(root, 'e2e/diagrams'))
      .map((f) => [f.slice(root.length), readFileSync(f, 'utf8')] as const)
      .filter(([, src]) => detectFlowchart(src) !== undefined);
    expect(corpus.length).toBeGreaterThan(400);

    const disagreements = new Map<string, string>();
    const covered = new Set<number>();
    for (const [file, src] of [...FIXTURES, ...corpus]) {
      const text = blankFrontMatter(src);
      const seen = highlighters.map(([name, h]) => [name, h(text)] as const);
      for (const [i, kind] of lexerKinds(src)) {
        if (/\s/.test(src[i] ?? '')) continue;
        covered.add(kind);
        const want = flowchartCategories[kind];
        for (const [name, cats] of seen) {
          const got = cats[i];
          if (got === want || (kind === T.ShapeData && got === 'String')) continue;
          const key = `${name}: ${NAMES[kind] ?? kind} is ${want}, highlighted ${got}`;
          if (!disagreements.has(key)) disagreements.set(key, `${file} at ${i}`);
        }
      }
    }
    expect(Object.fromEntries(disagreements)).toEqual({});
    const expected = [...Object.values(T), Kind.Comment, Kind.Directive].filter(
      (k) => !BLANK_KINDS.has(k)
    );
    const missing = expected.filter((k) => !covered.has(k)).map((k) => NAMES[k]);
    expect(missing, 'kinds with no sample').toEqual([]);
  }, 120_000);
});
