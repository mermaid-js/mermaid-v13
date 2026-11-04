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
import type { FlowToken } from '@mermaid-js/diagram-flowchart';
// The checked-in table, read from source: the package exports it from `./language` (#29),
// never from its main entry (the renderer's lazy chunk would keep it).
import { flowchartCategories } from '../../../packages/diagram-flowchart/src/generated/categories.ts';
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
  };

  it('reads kind keys and matches them to rules by name, unnamed rules by mode and pattern', () => {
    const keys = kindKeys(
      'export const K = {\n  NodeId: F,\n  Num: F + 1,\n  Quote: F + 2,\n} as const;',
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

  it('fails on a kind with no grammar rule', () => {
    expect(() => categoryTable(g, ['Arrow'], source)).toThrow(/kind Arrow matches no token rule/);
    expect(() => kindKeys('const x = 1;', 'K')).toThrow(/no `export const K/);
  });
});

function mmdFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) return mmdFiles(join(dir, e.name));
    return e.name.endsWith('.mmd') ? [join(dir, e.name)] : [];
  });
}

/**
 * Documented exceptions, where the highlighters see text differently from the lexer:
 *
 * 1. Front matter: the generated highlighters do not model it (they would read the YAML as
 *    flowchart text), so it is blanked before highlighting. Gap, see run notes GAPS.md.
 * 2. `ShapeData`: one kind for all of `@{ … }`; the highlighters show its quoted values as
 *    String, the table (one category per kind) says Meta.
 * 3. Text inside a token's range that the lexer never reads: `%%` comment lines (removed
 *    before lexing, e.g. after `end` and its blanks) and the `;` dropped from the end of a
 *    `style` / `classDef` line.
 */
const blankFrontMatter = (src: string) => {
  const end = preprocess(src).bodyStart;
  return src.slice(0, end).replace(/[^\n]/g, ' ') + src.slice(end);
};

function unread(src: string, tokens: FlowToken[]): Set<number> {
  const skip = new Set<number>();
  for (const m of src.matchAll(/%%(?!\{)[^\n]*/g)) {
    for (let i = m.index; i < m.index + m[0].length; i++) skip.add(i);
  }
  for (const t of tokens) {
    if (src[t.range.end - 1] === ';' && !t.text.endsWith(';')) skip.add(t.range.end - 1);
  }
  return skip;
}

const NAMES: Record<number, string> = Object.fromEntries(Object.entries(T).map(([k, v]) => [v, k]));

describe('four-way highlighting agreement over the flowchart corpus', () => {
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
    let checked = 0;
    for (const [file, src] of corpus) {
      const text = blankFrontMatter(src);
      const seen = highlighters.map(([name, h]) => [name, h(text)] as const);
      const tokens = flowchartTokens(src);
      const skip = unread(src, tokens);
      for (const t of tokens) {
        const want = flowchartCategories[t.kind];
        for (const [name, cats] of seen) {
          for (let i = t.range.start; i < t.range.end; i++) {
            if (skip.has(i) || /\s/.test(src[i] ?? '')) continue;
            checked++;
            const got = cats[i];
            if (got === want || (t.kind === T.ShapeData && got === 'String')) continue;
            const key = `${name}: ${NAMES[t.kind] ?? t.kind} is ${want}, highlighted ${got}`;
            if (!disagreements.has(key)) {
              const image = JSON.stringify(src.slice(t.range.start, t.range.end));
              disagreements.set(key, `${file} ${image}`);
            }
            break;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(10_000);
    expect(Object.fromEntries(disagreements)).toEqual({});
  }, 120_000);
});
