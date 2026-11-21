/**
 * The three adapters show one document the same way: Monaco (this package) and CodeMirror give
 * the same folds by line and the same semantic tokens by line, both from the service's
 * `lineFoldingRanges`/`lineSemanticTokens`. `language-server`'s `adapters-agree.spec.ts` holds
 * the LSP server to CodeMirror the same way (this package may not import the server: the
 * `language-server` zone in .fallowrc.json), so the three agree.
 * Before semantic tokens arrive, the two editors paint each diagram type with its own
 * generated grammar (D134): CodeMirror's Lezer parser and Monaco's Monarch tokens give the
 * same category to every character of the diagram, one document per v13 type.
 */
import { foldable } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import {
  loadHighlighter,
  mermaid,
  mermaidLanguage,
  semanticTokenRanges,
} from '@mermaid-js/language-service-codemirror';
import { LineIndex, SEMANTIC_TOKEN_LEGEND } from '@mermaid-js/language-service';
import { preprocess } from '@mermaid-js/core/preprocess';
import type * as Monaco from 'monaco-editor';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fakeMonaco } from './testing/fake-monaco.ts';
import { monarchTokens } from './testing/monarch.ts';
import { registerMermaid } from './index.ts';
import { highlighted, sampleOf } from '../scripts/highlighted.ts';

/**
 * One document per highlighted type, each folding somewhere: the type's
 * `packages/diagram-<type>/grammar/<type>.agree.mmd` (`scripts/highlighted.ts`).
 */
const DOCS: Readonly<Record<string, string>> = Object.fromEntries(
  highlighted().map((h) => [h.id, sampleOf(h, 'agree')])
);
/** Flowchart's, which the first suite reads line by line. */
const DOC = DOCS.flowchart!;

/** Monarch token type (without its postfix) → the Lezer node name for the same category. */
const MONARCH_CATEGORY: Readonly<Record<string, string>> = {
  keyword: 'Keyword',
  string: 'String',
  operator: 'Operator',
  number: 'Number',
  comment: 'Comment',
  delimiter: 'Punctuation',
  variable: 'Variable',
  constant: 'Constant',
  annotation: 'Meta',
  function: 'Function',
};

/** The category of each character of the diagram (after front matter) in CodeMirror. */
function lezerCategories(text: string): string[] {
  const out: string[] = Array.from({ length: text.length }, () => 'Other');
  mermaidLanguage()
    .language.parser.parse(text)
    .iterate({
      enter: (n) => {
        if (n.type.isTop || n.name === 'token') return;
        for (let i = n.from; i < n.to; i++) out[i] = n.name;
      },
    });
  return out;
}

/** The category of each character in Monaco's Monarch tokens, `id`'s file loaded. */
async function monarchCategories(id: string, text: string): Promise<string[]> {
  const fake = fakeMonaco();
  const reg = await registerMermaid(fake.monaco, { delay: 0 });
  try {
    fake.createModel(`file:///${id}.mmd`, text);
    const def = () => fake.monarch.get('mermaid') as Monaco.languages.IMonarchLanguage;
    await vi.waitFor(() => expect(Object.keys(def().tokenizer)).toContain(`${id}__root`));
    const index = new LineIndex(text);
    const out: string[] = Array.from({ length: text.length }, () => 'Other');
    for (const t of monarchTokens(def(), text)) {
      const category = MONARCH_CATEGORY[t.type.split('.')[0]!] ?? 'Other';
      const from = index.offset(t.line, t.start);
      for (let i = from; i < from + t.end - t.start; i++) out[i] = category;
    }
    return out;
  } finally {
    reg.dispose();
  }
}

const types: readonly string[] = SEMANTIC_TOKEN_LEGEND.types;
const modifiers: readonly string[] = SEMANTIC_TOKEN_LEGEND.modifiers;

/** `line:char+length type mods`, 0-based, from Monaco-encoded data. */
function decode(data: ArrayLike<number>): string[] {
  const out: string[] = [];
  let line = 0;
  let char = 0;
  for (let i = 0; i + 5 <= data.length; i += 5) {
    const dl = data[i]!;
    line += dl;
    char = dl === 0 ? char + data[i + 1]! : data[i + 1]!;
    const mods = modifiers.filter((_, bit) => data[i + 4]! & (1 << bit));
    out.push(`${line}:${char}+${data[i + 2]} ${[types[data[i + 3]!], ...mods].join(' ')}`);
  }
  return out;
}

async function monacoView(text: string): Promise<{ folds: string[]; tokens: string[] }> {
  const fake = fakeMonaco();
  const reg = await registerMermaid(fake.monaco);
  try {
    const model = fake.createModel('file:///agree.mmd', text);
    const token = {} as Monaco.CancellationToken;
    const folding = fake.provider('folding') as Monaco.languages.FoldingRangeProvider;
    const semantic = fake.provider(
      'semanticTokens'
    ) as Monaco.languages.DocumentSemanticTokensProvider;
    const folds = (await folding.provideFoldingRanges(model as never, {}, token)) ?? [];
    const tokens = (await semantic.provideDocumentSemanticTokens(
      model as never,
      null,
      token
    )) as Monaco.languages.SemanticTokens;
    return {
      folds: folds.map((f) => `${f.start - 1}-${f.end - 1}`),
      tokens: decode(tokens.data),
    };
  } finally {
    reg.dispose();
  }
}

async function codeMirrorView(text: string): Promise<{ folds: string[]; tokens: string[] }> {
  const state = EditorState.create({ doc: text, extensions: await mermaid() });
  const folds: string[] = [];
  for (let n = 1; n <= state.doc.lines; n++) {
    const line = state.doc.line(n);
    const fold = foldable(state, line.from, line.to);
    if (fold) folds.push(`${n - 1}-${state.doc.lineAt(fold.to).number - 1}`);
  }
  const index = new LineIndex(text);
  const tokens = semanticTokenRanges(state, [{ from: 0, to: state.doc.length }]).map((t) => {
    const { line, column } = index.position(t.from);
    const names = t.className.split(' ').map((c) => c.replace('cm-mermaid-', ''));
    return `${line}:${column}+${t.to - t.from} ${names.join(' ')}`;
  });
  return { folds, tokens };
}

describe('Monaco and CodeMirror agree', () => {
  let monaco: { folds: string[]; tokens: string[] };
  beforeAll(async () => {
    monaco = await monacoView(DOC);
  }, 30_000);

  it('on the folds by line, closing lines visible', async () => {
    // Front matter (keeps `---`), accDescr (keeps `}`), the label chain, the subgraph
    // (keeps `end`) and the multi-line `@{ }`.
    expect(monaco.folds).toEqual(['0-3', '6-8', '10-11', '12-15', '14-15']);
    expect((await codeMirrorView(DOC)).folds).toEqual(monaco.folds);
  });

  it('on the semantic tokens by line', async () => {
    expect(monaco.tokens.length).toBeGreaterThan(20);
    // A continuation piece starts after the indentation (`two` at column 5, not 0).
    expect(monaco.tokens).toContain('11:5+3 string');
    expect((await codeMirrorView(DOC)).tokens).toEqual(monaco.tokens);
  });
});

describe.each(Object.entries(DOCS).filter(([id]) => id !== 'flowchart'))(
  'Monaco and CodeMirror agree on a %s document',
  (_id, text) => {
    it('on the folds and the semantic tokens by line', async () => {
      const monacoSide = await monacoView(text);
      expect(monacoSide.folds.length).toBeGreaterThan(0);
      expect(monacoSide.tokens.length).toBeGreaterThan(5);
      expect(await codeMirrorView(text)).toEqual(monacoSide);
    }, 30_000);
  }
);

describe('the first paint (D134)', () => {
  beforeAll(async () => {
    for (const id of Object.keys(DOCS)) await loadHighlighter(id);
  });

  it.each(Object.entries(DOCS))(
    'CodeMirror and Monaco colour a %s document alike, with its own grammar',
    async (id, text) => {
      const body = preprocess(text).bodyStart;
      const lezer = lezerCategories(text).slice(body);
      const monarch = (await monarchCategories(id, text)).slice(body);
      // Whitespace is unstyled either way; every other character has one category.
      const shown = (cats: string[]) =>
        cats.map((c, i) => (/\s/.test(text[body + i]!) ? ' ' : c)).join('|');
      expect(shown(monarch)).toEqual(shown(lezer));
      // The header is a keyword: the type's grammar ran, not an empty or other type's one.
      const header = text.slice(body).search(/\S/);
      expect(lezer[header]).toBe('Keyword');
      expect(new Set(lezer).size).toBeGreaterThan(3);
    },
    30_000
  );
});
