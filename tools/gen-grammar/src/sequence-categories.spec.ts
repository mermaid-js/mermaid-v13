/**
 * Sequence highlighting (#28, #149): the kind → category table, and the four-way agreement of
 * the table with the generated TextMate, Monarch and Lezer grammars over the sequence corpus,
 * as `categories.spec.ts` checks flowchart.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Kind, sourceView, TOKEN_CATEGORIES } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import {
  detectSequence,
  sequenceCategories,
  SequenceTokenKind as T,
  sequenceTokens,
} from '@mermaid-js/diagram-sequence/language';
import { generate, generatedDir } from './generate.ts';
import {
  hidingFrontMatter,
  lezerCategorise,
  monarchCategorise,
  textMateCategorise,
} from './highlight-testing.ts';
import type { Categorise } from './highlight-testing.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const files = generate((p) => readFileSync(join(root, p), 'utf8'));
const out = (name: string) => files.get(`${generatedDir('sequence')}/${name}`) ?? '';

describe('sequence kind → category table', () => {
  it('gives every sequence and shared kind a highlight category', () => {
    const kinds = [...Object.values(T), ...Object.values(Kind)];
    for (const k of kinds) expect(TOKEN_CATEGORIES, `kind ${k}`).toContain(sequenceCategories[k]);
    expect(Object.keys(sequenceCategories)).toHaveLength(kinds.length);
  });

  it('takes the category from the grammar file’s scopes', () => {
    expect(sequenceCategories[T.SD]).toBe('Keyword');
    expect(sequenceCategories[T.Actor]).toBe('Variable');
    expect(sequenceCategories[T.SolidArrow]).toBe('Operator');
    expect(sequenceCategories[T.Txt]).toBe('String');
    expect(sequenceCategories[T.Num]).toBe('Number');
    expect(sequenceCategories[T.ConfigStart]).toBe('Meta');
    expect(sequenceCategories[Kind.Comment]).toBe('Comment');
  });
});

function mmdFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) return mmdFiles(join(dir, e.name));
    return e.name.endsWith('.mmd') ? [join(dir, e.name)] : [];
  });
}

/** Sources for the kinds the corpus lacks. */
const FIXTURES: [string, string][] = [
  [
    'acc',
    'sequenceDiagram\n  accTitle: t\n  accDescr: d\n  accDescr {\n    multi\n  }\n  A->>B: x',
  ],
  ['legacy-title', 'sequenceDiagram\n  title: Old style\n  A->>B: x'],
  ['title', 'sequenceDiagram\n  title Hello #lt;b#gt;\n  A->>B: x'],
  ['comments', 'sequenceDiagram\n  %% a comment\n  %%{init: {}}%%\n  A->>B: x'],
  ['autonumber-off', 'sequenceDiagram\n  autonumber off\n  A->>B: x'],
  [
    'menus',
    'sequenceDiagram\n  participant A\n  links A: {"x": "y"}\n  link A: Home @ https://x\n  properties A: {"k": "v"}\n  details A: el',
  ],
  [
    'create-destroy',
    'sequenceDiagram\n  create participant B\n  A->>B: x\n  destroy B\n  A->>B: y',
  ],
  ['par-over', 'sequenceDiagram\n  par_over a\n    A->>B: x\n  and b\n    A->>B: y\n  end'],
  [
    'critical-break',
    'sequenceDiagram\n  critical a\n    A->>B: x\n  option b\n    A->>B: y\n  end\n  break c\n    A->>B: z\n  end',
  ],
  ['central', 'sequenceDiagram\n  A->>()B: x\n  A()->>B: y'],
  ['semi', 'sequenceDiagram\n  A->>B: x; B->>A: y'],
  ['data', 'sequenceDiagram\n  participant A@{ "type": "queue" } as Q'],
  ['data-multiline', 'sequenceDiagram\n  participant A@{\n    type: queue\n  } as Q\n  A->>B: x'],
  [
    'alias-then-semi',
    'sequenceDiagram\n  participant A as Alice; A->>B: x as y\n  actor B as Bob; B->>A: ok\n  participant C@{ type: queue }; C->>A: z',
  ],
  ['message-text-as', 'sequenceDiagram\n  A->>B: sent as text\n  participant C'],
  [
    'entities',
    'sequenceDiagram\n  participant A#lt;B\n  A#35;B->>C: x\n  #lt; hi->>C: y\n  activate A#lt;B',
  ],
  ['invalid', 'sequenceDiagram\n  participant A<b>'],
  [
    'half-arrows',
    'sequenceDiagram\n' +
      [
        '-|\\',
        '-|/',
        '-\\\\',
        '-//',
        '/|-',
        '\\|-',
        '//-',
        '\\\\-',
        '--|\\',
        '--|/',
        '--\\\\',
        '--//',
        '/|--',
        '\\|--',
        '//--',
        '\\\\--',
        '<<->>',
        '<<-->>',
        '--x',
        '-)',
        '--)',
        '->',
        '-->',
      ]
        .map((a) => `  A${a}B: x`)
        .join('\n'),
  ],
];

/** Kinds whose tokens are blanks or empty, so no highlighter colours them. */
const BLANK_KINDS = new Set<number>([T.AliasEnd, T.Eof]);

/**
 * The kind of each character of `src` as the lexer sees it: its tokens, and the comments and
 * directives it removed (a directive wins over a comment hole that runs over it).
 */
function lexerKinds(src: string): Map<number, number> {
  const pre = preprocess(src);
  const view = sourceView(
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
  for (const t of sequenceTokens(src)) set(t.range.start, t.range.end, t.kind);
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

describe('four-way highlighting agreement (sequence)', () => {
  it('table, TextMate, Monarch and Lezer give every token the same category', async () => {
    const highlighters: [string, Categorise][] = [
      [
        'TextMate',
        await textMateCategorise(out('sequence.tmLanguage.json'), 'source.mermaid-sequence'),
      ],
      ['Monarch', monarchCategorise(out('sequence.monarch.json'))],
      [
        // As the CodeMirror adapter runs it: front matter hidden.
        'Lezer',
        hidingFrontMatter(
          await lezerCategorise(
            out('sequence.grammar'),
            out('sequence.tokens.js'),
            'sequence',
            join(root, 'tools/gen-grammar/node_modules/.cache/lezer-categories')
          )
        ),
      ],
    ];
    const corpus = mmdFiles(join(root, 'e2e/diagrams'))
      .map((f) => [f.slice(root.length), readFileSync(f, 'utf8')] as const)
      .filter(([, src]) => detectSequence(src));
    expect(corpus.length).toBeGreaterThan(150);

    const disagreements = new Map<string, string>();
    const covered = new Set<number>();
    for (const [file, src] of [...FIXTURES, ...corpus]) {
      const seen = highlighters.map(([name, h]) => [name, h(src)] as const);
      for (const [i, kind] of lexerKinds(src)) {
        if (/\s/.test(src[i] ?? '')) continue;
        covered.add(kind);
        const want = sequenceCategories[kind];
        for (const [name, cats] of seen) {
          const got = cats[i];
          if (got === want) continue;
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
