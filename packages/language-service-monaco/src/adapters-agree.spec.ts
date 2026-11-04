/**
 * The three adapters show one document the same way: Monaco (this package), the LSP server
 * (in process, over a stream pair) and CodeMirror give the same folds by line and the same
 * semantic tokens by line, all from the service's `lineFoldingRanges`/`lineSemanticTokens`.
 */
import { PassThrough } from 'node:stream';
import { foldable } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { startServer } from '@mermaid-js/language-server';
import { mermaid, semanticTokenRanges } from '@mermaid-js/language-service-codemirror';
import { LineIndex, SEMANTIC_TOKEN_LEGEND } from '@mermaid-js/language-service';
import type * as Monaco from 'monaco-editor';
import { createConnection } from 'vscode-languageserver/node';
import {
  createProtocolConnection,
  StreamMessageReader,
  StreamMessageWriter,
} from 'vscode-languageserver-protocol/node';
import type { FoldingRange, SemanticTokens } from 'vscode-languageserver-protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fakeMonaco } from './testing/fake-monaco.ts';
import { registerMermaid } from './index.ts';

const DOC = [
  '---',
  'title: Agreement',
  'config:',
  '  theme: dark',
  '---',
  'flowchart LR',
  '  accDescr {',
  '    two lines',
  '    of description',
  '  }',
  '  A["one',
  '     two"] --> B',
  '  subgraph S [Group]',
  '    B --> C',
  '    C@{ shape: rounded,',
  '        label: "x" }',
  '  end',
  '  classDef hot fill:#f00',
  '  class A,B hot',
  '',
].join('\n');

const types: readonly string[] = SEMANTIC_TOKEN_LEGEND.types;
const modifiers: readonly string[] = SEMANTIC_TOKEN_LEGEND.modifiers;

/** `line:char+length type mods`, 0-based, from LSP/Monaco-encoded data. */
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

async function lspView(text: string): Promise<{ folds: string[]; tokens: string[] }> {
  const toServer = new PassThrough();
  const toClient = new PassThrough();
  const server = createConnection(
    new StreamMessageReader(toServer),
    new StreamMessageWriter(toClient)
  );
  startServer(server, { facets: [] });
  const client = createProtocolConnection(
    new StreamMessageReader(toClient),
    new StreamMessageWriter(toServer)
  );
  client.listen();
  try {
    await client.sendRequest('initialize', { processId: null, rootUri: null, capabilities: {} });
    await client.sendNotification('initialized', {});
    const uri = 'file:///agree.mmd';
    const published = new Promise<void>((done) =>
      client.onNotification('textDocument/publishDiagnostics', () => done())
    );
    await client.sendNotification('textDocument/didOpen', {
      textDocument: { uri, languageId: 'mermaid', version: 1, text },
    });
    await published;
    const folds = await client.sendRequest<FoldingRange[]>('textDocument/foldingRange', {
      textDocument: { uri },
    });
    const tokens = await client.sendRequest<SemanticTokens>('textDocument/semanticTokens/full', {
      textDocument: { uri },
    });
    return {
      folds: folds.map((f) => `${f.startLine}-${f.endLine}`),
      tokens: decode(tokens.data),
    };
  } finally {
    client.dispose();
    server.dispose();
  }
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

describe('Monaco, the LSP server and CodeMirror agree', () => {
  let lsp: { folds: string[]; tokens: string[] };
  beforeAll(async () => {
    lsp = await lspView(DOC);
  }, 30_000);
  afterAll(() => undefined);

  it('on the folds by line, closing lines visible', async () => {
    // Front matter (keeps `---`), accDescr (keeps `}`), the label chain, the subgraph
    // (keeps `end`) and the multi-line `@{ }`.
    expect(lsp.folds).toEqual(['0-3', '6-8', '10-11', '12-15', '14-15']);
    expect((await monacoView(DOC)).folds).toEqual(lsp.folds);
    expect((await codeMirrorView(DOC)).folds).toEqual(lsp.folds);
  });

  it('on the semantic tokens by line', async () => {
    expect(lsp.tokens.length).toBeGreaterThan(20);
    // A continuation piece starts after the indentation (`two` at column 5, not 0).
    expect(lsp.tokens).toContain('11:5+3 string');
    expect((await monacoView(DOC)).tokens).toEqual(lsp.tokens);
    expect((await codeMirrorView(DOC)).tokens).toEqual(lsp.tokens);
  });
});
