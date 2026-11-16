/**
 * Scripted LSP client over stdio (R-LANG-2, D98, D99 suite 5): spawns the
 * `mermaid-language-server` bin and exercises every method it offers on flowchart fixtures.
 * Positions are 0-based lines and UTF-16 columns, written out by hand from the fixtures.
 */
import {
  COMPLETION_TRIGGERS,
  createLanguageService,
  LineIndex,
  SEMANTIC_TOKEN_LEGEND,
} from '@mermaid-js/language-service';
import { goldenCases, readFixture } from '@mermaid-js/language-service/testing';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  CompletionItem,
  DocumentHighlight,
  DocumentSymbol,
  FoldingRange,
  Hover,
  Location,
  SelectionRange,
  SemanticTokens,
  WorkspaceEdit,
} from 'vscode-languageserver-protocol';
import {
  DocumentHighlightKind,
  LSPErrorCodes,
  SymbolKind,
  TextDocumentSyncKind,
} from 'vscode-languageserver-protocol';
import { decodeTokens, startClient } from './testing/lsp-client.ts';
import type { Client } from './testing/lsp-client.ts';
import { detectorSource, FAKE_FACET, facetPackage, workspace } from './testing/workspace.ts';

const T = 60_000;
/** The opt-in to third-party facets (D157). */
const PLUGINS = { mermaid: { plugins: true } };

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
    expect(caps.documentHighlightProvider).toBe(true);
    expect(caps.selectionRangeProvider).toBe(true);
    expect(caps.documentSymbolProvider).toBe(true);
    // The same trigger characters as Monaco and CodeMirror.
    expect(caps.completionProvider).toEqual({ triggerCharacters: [...COMPLETION_TRIGGERS] });
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
    // `subgraph S1` … `end`: the `end` line stays visible.
    expect(folds).toContainEqual({ startLine: 3, endLine: 4 });
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
        // The label `Start⏎  here` (inside the quotes) becomes `Start` and `here` (indent left out).
        expect(tokens).toContainEqual({
          line: 1,
          char: 5,
          length: 5,
          type: 'string',
          modifiers: [],
        });
        expect(tokens).toContainEqual({
          line: 2,
          char: 2,
          length: 4,
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
        client.open('file:///work/notes.md', 'flowchart LR\n  A --> B[\n', 'markdown');
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
      const client = await startClient({
        rootUri: pathToFileURL(root).href,
        initializationOptions: PLUGINS,
      });
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

describe('review fixes (#38)', () => {
  /** Fails fast instead of waiting for the spec timeout when the session is wedged. */
  const within = <R>(p: Promise<R>, ms = 8000): Promise<R> =>
    Promise.race([
      p,
      new Promise<never>((_, fail) => setTimeout(() => fail(new Error('no answer')), ms)),
    ]);
  const LOUD = FAKE_FACET.replace(
    'parse: (text) => ({',
    "parse: (text) => (console.log('loud parse'), console.info('info'), {"
  );
  const THROWS = FAKE_FACET.replace(
    'parse: (text) => ({',
    "parse: (text) => { throw new Error('boom'); }, unused: (text) => ({"
  );

  it(
    'keeps stdout for LSP messages: a facet that logs does not wedge the session',
    async () => {
      const root = workspace({
        loud: {
          ...facetPackage('loud', 'loud'),
          'detector.js': `console.log('loud detector');\n${detectorSource('loud')}`,
          'language.js': `console.log('loud language');\n${LOUD}`,
        },
      });
      const client = await within(
        startClient({ rootUri: pathToFileURL(root).href, initializationOptions: PLUGINS })
      );
      try {
        client.open('file:///w/l.mmd', 'loud\n');
        const { diagnostics } = await within(client.diagnostics('file:///w/l.mmd'));
        expect(diagnostics.map((d) => d.code)).toEqual(['FAKE_WARNING']);
        expect(
          await within(
            client.connection.sendRequest('textDocument/hover', {
              textDocument: { uri: 'file:///w/l.mmd' },
              position: pos(0, 1),
            })
          )
        ).toBeNull();
        expect(client.stderr()).toContain('loud detector');
        expect(client.stderr()).toContain('loud parse');
      } finally {
        await client.stop();
      }
    },
    T
  );

  it(
    'passes on the LANGUAGE_FACET_FAILED error the service gives for a facet parse that throws',
    async () => {
      const root = workspace({
        thrower: { ...facetPackage('thrower', 'thrower'), 'language.js': THROWS },
      });
      const client = await startClient({
        rootUri: pathToFileURL(root).href,
        initializationOptions: PLUGINS,
      });
      const uri = 'file:///w/t.mmd';
      try {
        client.open(uri, 'flowchart LR\n  A --> B\n');
        await client.diagnostics(uri);
        client.change(uri, 'thrower\n  x\n', 2);
        const { diagnostics } = await within(client.diagnostics(uri));
        expect(diagnostics).toEqual([
          expect.objectContaining({
            severity: 1,
            code: 'LANGUAGE_FACET_FAILED',
            range: range(0, 0, 7),
          }),
        ]);
        expect(diagnostics[0]!.message).toContain('boom');
        const hover = await client.connection.sendRequest('textDocument/hover', {
          textDocument: { uri },
          position: pos(1, 2),
        });
        expect(hover).toBeNull();
        // Ranged changes apply to the new text, not the old snapshot's.
        await client.connection.sendNotification('textDocument/didChange', {
          textDocument: { uri, version: 3 },
          contentChanges: [{ range: range(0, 0, 7), text: 'flowchart LR\n  B' }],
        });
        expect((await within(client.diagnostics(uri))).diagnostics).toEqual([]);
        const def = await client.connection.sendRequest<Location>('textDocument/definition', {
          textDocument: { uri },
          position: pos(2, 2),
        });
        expect(def.range).toEqual(range(2, 2, 3));
      } finally {
        await client.stop();
      }
    },
    T
  );

  it(
    'ignores an older version and applies ranged changes in order',
    async () => {
      const client = await startClient();
      const uri = 'file:///w/v.mmd';
      try {
        client.open(uri, 'flowchart LR\n  A --> B\n');
        await client.diagnostics(uri);
        client.change(uri, 'flowchart LR\n  Q --> R\n', 5);
        client.change(uri, 'flowchart LR\n  OLD --> R\n', 3);
        await client.connection.sendNotification('textDocument/didChange', {
          textDocument: { uri, version: 6 },
          contentChanges: [
            { range: range(0, 0, 0), text: '%% x\n' },
            { range: range(2, 2, 3), text: 'Zed' },
          ],
        });
        await client.diagnostics(uri);
        expect((await client.diagnostics(uri)).diagnostics).toEqual([]);
        const refs = await client.connection.sendRequest<Location[]>('textDocument/references', {
          textDocument: { uri },
          position: pos(2, 2),
          context: { includeDeclaration: true },
        });
        expect(refs.map((r) => r.range)).toEqual([range(2, 2, 5)]);
        // Version 3 made no push: the pushes answer versions 1, 5 and 6 (#806).
        expect(client.published.filter((p) => p.uri === uri).map((p) => p.version)).toEqual([
          1, 5, 6,
        ]);
      } finally {
        await client.stop();
      }
    },
    T
  );

  it(
    'follows the client markup capability for hover and completion docs',
    async () => {
      const client = await startClient({
        capabilities: {
          textDocument: {
            hover: { contentFormat: ['plaintext'] },
            completion: { completionItem: { documentationFormat: ['plaintext'] } },
          },
        },
      });
      const uri = 'file:///w/m.mmd';
      try {
        client.open(uri, FLOW);
        await client.diagnostics(uri);
        const hover = await client.connection.sendRequest<Hover>('textDocument/hover', {
          textDocument: { uri },
          position: pos(4, 10),
        });
        expect(hover.contents).toMatchObject({ kind: 'plaintext' });
        expect((hover.contents as { value: string }).value).not.toMatch(/\*\*|`/);
        const items = await client.connection.sendRequest<CompletionItem[]>(
          'textDocument/completion',
          { textDocument: { uri }, position: pos(5, 2) }
        );
        const documented = items.filter((i) => i.documentation !== undefined);
        expect(documented.length).toBeGreaterThan(0);
        for (const i of documented) expect(i.documentation).toMatchObject({ kind: 'plaintext' });
      } finally {
        await client.stop();
      }
    },
    T
  );

  it(
    'serves a document by language id `mermaid` too (an untitled buffer)',
    async () => {
      const client = await startClient();
      try {
        client.open('untitled:Untitled-1', 'flowchart LR\n  A --> B[\n');
        expect((await within(client.diagnostics('untitled:Untitled-1'))).diagnostics).toHaveLength(
          1
        );
      } finally {
        await client.stop();
      }
    },
    T
  );

  it(
    'with plugins on, scans every workspace folder; by default scans none (D157)',
    async () => {
      const a = workspace({ 'mermaid-a': facetPackage('mermaid-a', 'aaa') });
      const b = workspace({ 'mermaid-b': facetPackage('mermaid-b', 'bbb') });
      const workspaceFolders = [
        { uri: pathToFileURL(a).href, name: 'a' },
        { uri: pathToFileURL(b).href, name: 'b' },
      ];
      const codes = async (client: Client) => {
        const out = [];
        for (const word of ['aaa', 'bbb']) {
          client.open(`file:///w/${word}.mmd`, `${word}\n`);
          out.push(
            (await client.diagnostics(`file:///w/${word}.mmd`)).diagnostics.map((d) => d.code)
          );
        }
        return out;
      };
      const all = await startClient({ workspaceFolders, initializationOptions: PLUGINS });
      try {
        expect(await codes(all)).toEqual([['FAKE_WARNING'], ['FAKE_WARNING']]);
      } finally {
        await all.stop();
      }
      const none = await startClient({ workspaceFolders });
      try {
        expect(await codes(none)).toEqual([['UNSUPPORTED_DIAGRAM'], ['UNSUPPORTED_DIAGRAM']]);
      } finally {
        await none.stop();
      }
    },
    T
  );

  it(
    'imports nothing from the workspace without the opt-in (D157)',
    async () => {
      const root = workspace({});
      const marker = join(root, 'detector-ran');
      const pkg = facetPackage('mermaid-fake', 'fake');
      const files = {
        ...pkg,
        'detector.js': `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(marker)}, 'ran');\n${detectorSource('fake')}`,
        'language.js': `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(marker)}, 'ran');\n${FAKE_FACET}`,
      };
      mkdirSync(join(root, 'node_modules', 'mermaid-fake'), { recursive: true });
      for (const [f, text] of Object.entries(files))
        writeFileSync(join(root, 'node_modules', 'mermaid-fake', f), text);
      for (const initializationOptions of [
        undefined,
        {},
        { mermaid: {} },
        { mermaid: { plugins: 'yes' } },
      ]) {
        const client = await startClient({
          rootUri: pathToFileURL(root).href,
          initializationOptions,
        });
        try {
          client.open('file:///w/f.mmd', 'fake\n');
          const { diagnostics } = await client.diagnostics('file:///w/f.mmd');
          expect(diagnostics.map((d) => d.code)).toEqual(['UNSUPPORTED_DIAGRAM']);
        } finally {
          await client.stop();
        }
        expect(existsSync(marker)).toBe(false);
      }
      const on = await startClient({
        rootUri: pathToFileURL(root).href,
        initializationOptions: PLUGINS,
      });
      try {
        on.open('file:///w/f.mmd', 'fake\n');
        expect((await on.diagnostics('file:///w/f.mmd')).diagnostics.map((d) => d.code)).toEqual([
          'FAKE_WARNING',
        ]);
      } finally {
        await on.stop();
      }
      expect(existsSync(marker)).toBe(true);
    },
    T
  );

  it(
    'with plugins on, a package claiming flowchart-v2 does not take over flowchart',
    async () => {
      const root = workspace({ hijack: facetPackage('hijack', 'flowchart-v2', 'flowchart') });
      const client = await startClient({
        rootUri: pathToFileURL(root).href,
        initializationOptions: PLUGINS,
      });
      try {
        client.open('file:///w/h.mmd', 'flowchart LR\n  A --> B\n');
        expect((await client.diagnostics('file:///w/h.mmd')).diagnostics).toEqual([]);
        const hover = await client.connection.sendRequest<Hover>('textDocument/hover', {
          textDocument: { uri: 'file:///w/h.mmd' },
          position: pos(1, 2),
        });
        expect((hover.contents as { value: string }).value).toContain('node');
      } finally {
        await client.stop();
      }
    },
    T
  );
});

describe('versioned diagnostics and incremental sync (#806)', () => {
  it(
    'advertises incremental sync',
    async () => {
      const client = await startClient();
      try {
        expect(client.init.capabilities.textDocumentSync).toEqual({
          openClose: true,
          change: TextDocumentSyncKind.Incremental,
        });
      } finally {
        await client.stop();
      }
    },
    T
  );

  it(
    'sends the version each push answers; the push on close has none',
    async () => {
      const client = await startClient();
      const uri = 'file:///w/versions.mmd';
      try {
        client.open(uri, FLOW);
        expect(await client.diagnostics(uri)).toMatchObject({ version: 1 });
        client.change(uri, VALID, 2);
        expect(await client.diagnostics(uri)).toMatchObject({ version: 2, diagnostics: [] });
        client.edit(uri, 7, [{ range: range(8, 0, 0), text: '  C --> D[unclosed' }]);
        const ranged = await client.diagnostics(uri);
        expect(ranged.version).toBe(7);
        expect(ranged.diagnostics).toHaveLength(1);
        client.close(uri);
        const closed = await client.diagnostics(uri);
        expect(closed.diagnostics).toEqual([]);
        expect(closed.version).toBeUndefined();
      } finally {
        await client.stop();
      }
    },
    T
  );

  it(
    'applies several ranged changes of one notification in order, on CRLF and astral text',
    async () => {
      const client = await startClient();
      const uri = 'file:///w/crlf.mmd';
      // Line 1: the emoji takes columns 5–6 (two UTF-16 units), so `B` is at column 16.
      const text = 'flowchart LR\r\n  A["😀 x"] --> B\r\n  B --> C\r\n';
      const references = async (line: number, character: number) =>
        (
          await client.connection.sendRequest<Location[]>('textDocument/references', {
            textDocument: { uri },
            position: pos(line, character),
            context: { includeDeclaration: true },
          })
        ).map((r) => r.range);
      try {
        client.open(uri, text);
        await client.diagnostics(uri);
        client.edit(uri, 2, [
          { range: range(1, 16, 17), text: 'Bee' },
          // Applies to the text after the first change.
          { range: range(2, 2, 3), text: 'Bee' },
          // Across the CRLF at the end of line 2.
          { range: range(2, 11, 0, 3), text: ' & D\r\n' },
        ]);
        expect(await client.diagnostics(uri)).toMatchObject({ version: 2, diagnostics: [] });
        // flowchart LR\r\n  A["😀 x"] --> Bee\r\n  Bee --> C & D\r\n
        expect(await references(2, 2)).toEqual([range(1, 16, 19), range(2, 2, 5)]);
        expect(await references(2, 14)).toEqual([range(2, 14, 15)]);
        // A full-text change still replaces the whole text.
        client.edit(uri, 3, [{ text: 'flowchart LR\n  Q --> R\n' }]);
        expect(await client.diagnostics(uri)).toMatchObject({ version: 3, diagnostics: [] });
        expect(await references(1, 2)).toEqual([range(1, 2, 3)]);
      } finally {
        await client.stop();
      }
    },
    T
  );
});

describe('completion order (#807)', () => {
  const GOLDENS = join(import.meta.dirname, '..', '..', 'language-service', 'goldens');
  /** How an LSP client orders a list: by `sortText`, else by `label`. */
  const clientOrder = (items: readonly CompletionItem[]) =>
    items
      .map((i) => ({ key: i.sortText ?? i.label, label: i.label }))
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
      .map((i) => i.label);

  it.each(['flowchart', 'sequence'])(
    'sorted by sortText, the items of every %s completion golden are in the service order',
    async (diagram) => {
      const service = createLanguageService();
      await service.preload();
      const client = await startClient();
      let lists = 0;
      try {
        const cases = goldenCases(GOLDENS).filter(
          (c) => c.diagram === diagram && c.feature === 'completions'
        );
        expect(cases.length).toBeGreaterThan(5);
        for (const c of cases) {
          const { text, markers } = readFixture(readFileSync(c.input, 'utf8'));
          const uri = `file:///w/${diagram}-${c.name}.mmd`;
          client.open(uri, text);
          await client.diagnostics(uri);
          const doc = service.update(uri, text);
          const index = new LineIndex(text);
          for (const offset of markers) {
            const { line, column } = index.position(offset);
            const items = await client.connection.sendRequest<CompletionItem[]>(
              'textDocument/completion',
              { textDocument: { uri }, position: pos(line, column) }
            );
            const expected = doc.completions(offset).map((i) => i.label);
            expect(clientOrder(items), `${c.name} at ${line}:${column}`).toEqual(expected);
            if (expected.length > 10) lists++;
          }
        }
        // The fixtures hold lists long enough that ordering by label would differ.
        expect(lists).toBeGreaterThan(0);
      } finally {
        await client.stop();
      }
    },
    T
  );
});

describe('a third-party facet whose queries throw (#809)', () => {
  /** FAKE_FACET with one `thing` symbol over `fake`, and a hover and isValidId that throw. */
  const THROWING = FAKE_FACET.replace(
    'symbols: [],',
    "symbols: [{ name: 'fake', kind: 'thing', role: 'def', range: { start: 0, end: 4 } }],"
  )
    .replace('isValidId: () => undefined,', "isValidId: () => { throw new Error('boom id'); },")
    .replace('hover: () => undefined,', "hover: () => { throw new Error('boom hover'); },");

  it(
    'answers hover with null and rename with a -32803 refusal, not an internal error',
    async () => {
      expect(THROWING).toContain('boom id');
      expect(THROWING).toContain('boom hover');
      expect(THROWING).toContain("name: 'fake'");
      const root = workspace({
        'mermaid-fake': { ...facetPackage('mermaid-fake', 'fake'), 'language.js': THROWING },
      });
      const client = await startClient({
        rootUri: pathToFileURL(root).href,
        initializationOptions: PLUGINS,
      });
      const uri = 'file:///w/throwing.mmd';
      const at = { textDocument: { uri }, position: pos(0, 1) };
      try {
        client.open(uri, 'fake\n');
        expect((await client.diagnostics(uri)).diagnostics.map((d) => d.code)).toEqual([
          'FAKE_WARNING',
        ]);
        expect(await client.connection.sendRequest('textDocument/hover', at)).toBeNull();
        // The facet was reached: prepareRename finds the symbol, rename asks isValidId.
        expect(await client.connection.sendRequest('textDocument/prepareRename', at)).toEqual({
          range: range(0, 0, 4),
          placeholder: 'fake',
        });
        const refused = await client.connection
          .sendRequest('textDocument/rename', { ...at, newName: 'zed' })
          .then(
            () => undefined,
            (error: unknown) => error as { code: number; message: string }
          );
        expect(refused).toMatchObject({ code: LSPErrorCodes.RequestFailed });
        expect(refused?.message).toBe('The fake language support failed on this rename (boom id).');
      } finally {
        await client.stop();
      }
    },
    T
  );
});

describe('highlights, selection ranges and the outline (#810)', () => {
  let client: Client;
  const flow = 'file:///w/outline.mmd';
  const state = 'file:///w/outline-state.mmd';
  /** Lines 0–7: a composite state with two states inside. */
  const STATE = [
    'stateDiagram-v2',
    '  [*] --> Idle',
    '  state Busy {',
    '    A --> B',
    '    B --> A',
    '  }',
    '  Idle --> Busy',
    '',
  ].join('\n');
  const request = <R>(method: string, params: object) =>
    client.connection.sendRequest<R>(method, params);

  beforeAll(async () => {
    client = await startClient({
      capabilities: {
        textDocument: { documentSymbol: { hierarchicalDocumentSymbolSupport: true } },
      },
    });
    client.open(flow, VALID);
    client.open(state, STATE);
    await client.diagnostics(flow);
    await client.diagnostics(state);
  }, T);
  afterAll(async () => {
    await client.stop();
  }, T);

  it('highlights every use of a name, its definition as a write', async () => {
    expect(
      await request<DocumentHighlight[]>('textDocument/documentHighlight', {
        textDocument: { uri: flow },
        position: pos(4, 4),
      })
    ).toEqual([
      { range: range(2, 13, 14), kind: DocumentHighlightKind.Write },
      { range: range(4, 4, 5), kind: DocumentHighlightKind.Text },
      { range: range(7, 10, 11), kind: DocumentHighlightKind.Text },
    ]);
    expect(
      await request<DocumentHighlight[]>('textDocument/documentHighlight', {
        textDocument: { uri: state },
        position: pos(4, 10),
      })
    ).toEqual([
      { range: range(3, 4, 5), kind: DocumentHighlightKind.Write },
      { range: range(4, 10, 11), kind: DocumentHighlightKind.Text },
    ]);
    // Nothing on a keyword; null for a document the server does not hold.
    expect(
      await request('textDocument/documentHighlight', {
        textDocument: { uri: flow },
        position: pos(0, 2),
      })
    ).toEqual([]);
    expect(
      await request('textDocument/documentHighlight', {
        textDocument: { uri: 'file:///w/closed.mmd' },
        position: pos(0, 0),
      })
    ).toBeNull();
  });

  /** A selection range chain as its ranges, innermost first. */
  const chain = (s: SelectionRange | undefined): unknown[] =>
    s ? [s.range, ...chain(s.parent)] : [];

  it('expands the selection from a name to the whole text, one chain per position', async () => {
    const ranges = await request<SelectionRange[]>('textDocument/selectionRange', {
      textDocument: { uri: flow },
      positions: [pos(4, 10), pos(1, 2)],
    });
    expect(ranges).toHaveLength(2);
    // `C` in `    B --> C`, inside `subgraph S1`.
    expect(chain(ranges[0])).toEqual([
      range(4, 10, 11),
      range(4, 4, 11),
      range(3, 2, 5, 5),
      range(0, 0, 0, 8),
    ]);
    // `A` in `A["Start⏎  here"] --> B(End)`.
    expect(chain(ranges[1])).toEqual([
      range(1, 2, 3),
      range(1, 2, 8, 2),
      range(1, 2, 19, 2),
      range(0, 0, 0, 8),
    ]);
    const inState = await request<SelectionRange[]>('textDocument/selectionRange', {
      textDocument: { uri: state },
      positions: [pos(3, 4)],
    });
    expect(chain(inState[0])).toEqual([
      range(3, 4, 5),
      range(3, 4, 11),
      range(2, 2, 3, 5),
      range(0, 0, 0, 7),
    ]);
  });

  const sym = (
    name: string,
    kind: SymbolKind,
    r: ReturnType<typeof range>,
    selectionRange: ReturnType<typeof range>,
    children: DocumentSymbol[] = []
  ): DocumentSymbol => ({ name, kind, range: r, selectionRange, children });

  it('lists the outline nested by block; a block is a namespace, any other symbol a variable', async () => {
    expect(
      await request<DocumentSymbol[]>('textDocument/documentSymbol', {
        textDocument: { uri: flow },
      })
    ).toEqual([
      sym('A', SymbolKind.Variable, range(1, 2, 19, 2), range(1, 2, 3)),
      sym('B', SymbolKind.Variable, range(1, 2, 19, 2), range(2, 13, 14)),
      sym('S1', SymbolKind.Namespace, range(3, 2, 5, 5), range(3, 11, 13), [
        sym('C', SymbolKind.Variable, range(4, 4, 11), range(4, 10, 11)),
      ]),
      sym('hot', SymbolKind.Variable, range(6, 2, 24), range(6, 11, 14)),
    ]);
    expect(
      await request<DocumentSymbol[]>('textDocument/documentSymbol', {
        textDocument: { uri: state },
      })
    ).toEqual([
      sym('Idle', SymbolKind.Variable, range(1, 2, 14), range(1, 10, 14)),
      sym('Busy', SymbolKind.Namespace, range(2, 2, 3, 5), range(2, 8, 12), [
        sym('A', SymbolKind.Variable, range(3, 4, 11), range(3, 4, 5)),
        sym('B', SymbolKind.Variable, range(3, 4, 11), range(3, 10, 11)),
      ]),
    ]);
  });

  it(
    'lists the outline flat, with container names, for a client without nested symbols',
    async () => {
      const flat = await startClient();
      try {
        flat.open(state, STATE);
        await flat.diagnostics(state);
        expect(
          await flat.connection.sendRequest('textDocument/documentSymbol', {
            textDocument: { uri: state },
          })
        ).toEqual([
          {
            name: 'Idle',
            kind: SymbolKind.Variable,
            location: { uri: state, range: range(1, 2, 14) },
          },
          {
            name: 'Busy',
            kind: SymbolKind.Namespace,
            location: { uri: state, range: range(2, 2, 3, 5) },
          },
          {
            name: 'A',
            kind: SymbolKind.Variable,
            location: { uri: state, range: range(3, 4, 11) },
            containerName: 'Busy',
          },
          {
            name: 'B',
            kind: SymbolKind.Variable,
            location: { uri: state, range: range(3, 4, 11) },
            containerName: 'Busy',
          },
        ]);
      } finally {
        await flat.stop();
      }
    },
    T
  );
});
