/**
 * Scripted LSP client over stdio (R-LANG-2, D98, D99 suite 5): spawns the
 * `mermaid-language-server` bin and exercises every method it offers on flowchart fixtures.
 * Positions are 0-based lines and UTF-16 columns, written out by hand from the fixtures.
 */
import { SEMANTIC_TOKEN_LEGEND } from '@mermaid-js/language-service';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  CompletionItem,
  FoldingRange,
  Hover,
  Location,
  SemanticTokens,
  WorkspaceEdit,
} from 'vscode-languageserver-protocol';
import { decodeTokens, startClient } from './testing/lsp-client.ts';
import type { Client } from './testing/lsp-client.ts';
import { FAKE_FACET, facetPackage, workspace } from './testing/workspace.ts';

const T = 60_000;

/** Lines 0–8. Line 8 leaves a `[` open: one error. */
const FLOW = [
  'flowchart LR',
  '  A["Start',
  '  here"] --> B(End)',
  '  subgraph S1 [Group]',
  '    B --> C',
  '  end',
  '  classDef hot fill:#f00',
  '  class A,B hot',
  '  C --> D[unclosed',
].join('\n');
const VALID = FLOW.split('\n').slice(0, 8).join('\n') + '\n';

const pos = (line: number, character: number) => ({ line, character });
const range = (line: number, from: number, to: number, endLine = line) => ({
  start: pos(line, from),
  end: pos(endLine, to),
});

describe('mermaid-language-server over stdio', () => {
  let client: Client;
  const uri = 'file:///work/flow.mmd';

  beforeAll(async () => {
    client = await startClient();
  }, T);
  afterAll(async () => {
    await client.stop();
  }, T);

  it('advertises every method and the service legend', () => {
    const caps = client.init.capabilities;
    expect(caps.semanticTokensProvider).toMatchObject({
      full: true,
      legend: {
        tokenTypes: [...SEMANTIC_TOKEN_LEGEND.types],
        tokenModifiers: [...SEMANTIC_TOKEN_LEGEND.modifiers],
      },
    });
    expect(caps.definitionProvider).toBe(true);
    expect(caps.referencesProvider).toBe(true);
    expect(caps.renameProvider).toEqual({ prepareProvider: true });
    expect(caps.hoverProvider).toBe(true);
    expect(caps.foldingRangeProvider).toBe(true);
    expect(caps.completionProvider).toBeDefined();
    expect(caps.positionEncoding ?? 'utf-16').toBe('utf-16');
    expect(client.init.serverInfo?.name).toBe('mermaid-language-server');
  });

  it(
    'pushes diagnostics on open, change and close',
    async () => {
      client.open(uri, FLOW);
      const opened = await client.diagnostics(uri);
      expect(opened.diagnostics).toHaveLength(1);
      expect(opened.diagnostics[0]).toMatchObject({ severity: 1, source: 'mermaid' });
      expect(opened.diagnostics[0]!.range.start.line).toBe(8);
      client.change(uri, VALID, 2);
      expect((await client.diagnostics(uri)).diagnostics).toEqual([]);
      client.change(uri, FLOW, 3);
      expect((await client.diagnostics(uri)).diagnostics).toHaveLength(1);
    },
    T
  );

  const request = <R>(method: string, params: object) =>
    client.connection.sendRequest<R>(method, params);
  const doc = { textDocument: { uri } };

  it('goes to the definition of a node', async () => {
    // `B` on line 4 → its first mention, `B(End)` on line 2.
    const loc = await request<Location>('textDocument/definition', { ...doc, position: pos(4, 4) });
    expect(loc).toEqual({ uri, range: range(2, 13, 14) });
  });

  it('finds references, with and without the declaration', async () => {
    const all = await request<Location[]>('textDocument/references', {
      ...doc,
      position: pos(4, 4),
      context: { includeDeclaration: true },
    });
    expect(all.map((l) => l.range)).toEqual([range(2, 13, 14), range(4, 4, 5), range(7, 10, 11)]);
    const refs = await request<Location[]>('textDocument/references', {
      ...doc,
      position: pos(4, 4),
      context: { includeDeclaration: false },
    });
    expect(refs.map((l) => l.range)).toEqual([range(4, 4, 5), range(7, 10, 11)]);
  });

  it('prepares and performs a rename', async () => {
    expect(await request('textDocument/prepareRename', { ...doc, position: pos(7, 10) })).toEqual({
      range: range(7, 10, 11),
      placeholder: 'B',
    });
    const edit = await request<WorkspaceEdit>('textDocument/rename', {
      ...doc,
      position: pos(7, 10),
      newName: 'Bee',
    });
    expect(edit.changes?.[uri]).toEqual([
      { range: range(2, 13, 14), newText: 'Bee' },
      { range: range(4, 4, 5), newText: 'Bee' },
      { range: range(7, 10, 11), newText: 'Bee' },
    ]);
  });

  it('refuses a rename with the reason as an error response', async () => {
    await expect(
      request('textDocument/prepareRename', { ...doc, position: pos(0, 3) })
    ).rejects.toThrow(/no id or class name/);
    await expect(
      request('textDocument/rename', { ...doc, position: pos(4, 4), newName: 'C' })
    ).rejects.toMatchObject({ code: -32803 });
  });

  it('hovers a node with markdown', async () => {
    const hover = await request<Hover>('textDocument/hover', { ...doc, position: pos(4, 10) });
    expect(hover.range).toEqual(range(4, 10, 11));
    expect(hover.contents).toMatchObject({ kind: 'markdown' });
    expect((hover.contents as { value: string }).value).toContain('C');
    expect(await request('textDocument/hover', { ...doc, position: pos(5, 0) })).toBeNull();
  });

  it('folds the subgraph and the multi-line label by line', async () => {
    const folds = await request<FoldingRange[]>('textDocument/foldingRange', doc);
    expect(folds).toContainEqual({ startLine: 3, endLine: 5 });
    for (const f of folds) expect(f.endLine).toBeGreaterThan(f.startLine);
  });

  it('completes ids and keywords with a text edit', async () => {
    const items = await request<CompletionItem[]>('textDocument/completion', {
      ...doc,
      position: pos(4, 10),
    });
    // `    B --> C|`: the word `C` is replaced.
    const c = items.find((i) => i.label === 'C');
    expect(c).toMatchObject({ kind: 6, textEdit: { range: range(4, 10, 11), newText: 'C' } });
    expect(items.map((i) => i.label)).toContain('A');
  });
});

describe('semantic tokens over stdio', () => {
  const uri = 'file:///work/tokens.mmd';
  const legend = {
    tokenTypes: [...SEMANTIC_TOKEN_LEGEND.types],
    tokenModifiers: [...SEMANTIC_TOKEN_LEGEND.modifiers],
  };
  const tokensOf = async (client: Client) => {
    client.open(uri, FLOW);
    await client.diagnostics(uri);
    const { data } = await client.connection.sendRequest<SemanticTokens>(
      'textDocument/semanticTokens/full',
      { textDocument: { uri } }
    );
    return decodeTokens(data, legend);
  };

  it(
    'splits a multi-line token per line for a client without multi-line support',
    async () => {
      const client = await startClient();
      try {
        const tokens = await tokensOf(client);
        const lines = FLOW.split('\n');
        // The label `Start⏎  here` (inside the quotes) becomes `Start` and `  here`.
        expect(tokens).toContainEqual({
          line: 1,
          char: 5,
          length: 5,
          type: 'string',
          modifiers: [],
        });
        expect(tokens).toContainEqual({
          line: 2,
          char: 0,
          length: 6,
          type: 'string',
          modifiers: [],
        });
        // `A` is declared and defined on line 1.
        expect(tokens).toContainEqual({
          line: 1,
          char: 2,
          length: 1,
          type: 'node',
          modifiers: ['declaration', 'definition'],
        });
        for (const t of tokens)
          expect(t.char + t.length).toBeLessThanOrEqual(lines[t.line]!.length);
      } finally {
        await client.stop();
      }
    },
    T
  );

  it(
    'keeps a multi-line token whole for a client with multi-line support',
    async () => {
      const client = await startClient({
        capabilities: {
          textDocument: { semanticTokens: { multilineTokenSupport: true } },
        } as never,
      });
      try {
        const tokens = await tokensOf(client);
        expect(tokens).toContainEqual({
          line: 1,
          char: 5,
          length: 12,
          type: 'string',
          modifiers: [],
        });
      } finally {
        await client.stop();
      }
    },
    T
  );
});

describe('documents and facets the server serves', () => {
  it(
    'serves .mmd and .mermaid only',
    async () => {
      const client = await startClient();
      try {
        client.open('file:///work/notes.md', 'flowchart LR\n  A --> B[\n');
        client.open('file:///work/README.MERMAID', 'flowchart LR\n  A --> B[\n');
        const served = await client.diagnostics('file:///work/README.MERMAID');
        expect(served.diagnostics).toHaveLength(1);
        expect(client.published.map((p) => p.uri)).toEqual(['file:///work/README.MERMAID']);
        const def = await client.connection.sendRequest('textDocument/definition', {
          textDocument: { uri: 'file:///work/notes.md' },
          position: pos(1, 2),
        });
        expect(def).toBeNull();
      } finally {
        await client.stop();
      }
    },
    T
  );

  it(
    'loads third-party facets from the workspace node_modules before answering initialize',
    async () => {
      const root = workspace({
        // A facet that takes a while to load: a server that did not wait would answer first.
        'mermaid-fake': {
          ...facetPackage('mermaid-fake', 'fake'),
          'language.js': `await new Promise((done) => setTimeout(done, 500));\n${FAKE_FACET}`,
        },
        'broken-json': { 'package.json': '{' },
      });
      const client = await startClient({ rootUri: pathToFileURL(root).href });
      try {
        // Opened right after `initialized`: the facet is already there (D155).
        client.open('file:///work/a.mmd', 'fake\n');
        const { diagnostics } = await client.diagnostics('file:///work/a.mmd');
        expect(diagnostics.map((d) => d.code)).toEqual(['FAKE_WARNING']);
        client.open('file:///work/b.mmd', 'flowchart LR\n  A --> B\n');
        expect((await client.diagnostics('file:///work/b.mmd')).diagnostics).toEqual([]);
      } finally {
        expect(await client.stop()).toBe(0);
      }
    },
    T
  );
});
