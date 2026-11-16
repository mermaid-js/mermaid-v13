/**
 * Mermaid fences in Markdown documents over stdio (D581, #811): with `mermaid.markdown` the
 * server runs the service on each fence body of a Markdown document and maps every position
 * by the body's start; outside the fences it answers nothing. Semantic tokens and folding
 * stay off for Markdown documents unless `mermaid.markdownTokensAndFolding` turns them on.
 * The oracle for mapped answers is the same body opened as a `.mmd` document.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  CompletionItem,
  DocumentHighlight,
  DocumentSymbol,
  FoldingRange,
  Hover,
  Location,
  PublishDiagnosticsParams,
  SelectionRange,
  SemanticTokens,
  TextEdit,
  WorkspaceEdit,
} from 'vscode-languageserver-protocol';
import { DocumentHighlightKind, SymbolKind } from 'vscode-languageserver-protocol';
import { decodeTokens, startClient } from './testing/lsp-client.ts';
import type { Client } from './testing/lsp-client.ts';

const T = 60_000;
const MARKDOWN = { mermaid: { markdown: true } };
const WITH_TOKENS = { mermaid: { markdown: true, markdownTokensAndFolding: true } };

/** Two fences: a tilde one (lines 5–7) and a backtick one inside a list item (lines 13–16). */
const LINES = [
  '# Notes',
  '',
  'A and X are letters in this prose.',
  '',
  '~~~mermaid',
  'flowchart LR',
  '  A --> X',
  '  X --> (',
  '~~~',
  '',
  '1. Step one',
  '',
  '   ```mermaid',
  '   flowchart TD',
  '     A --> B',
  '     B --> A',
  '     B --> (',
  '   ```',
  '',
  'Closing prose with A.',
  '',
];
const MD = LINES.join('\n');
/** Each fence's body and the Markdown line it starts on. */
const FENCES = [
  { line: 5, text: LINES.slice(5, 8).join('\n') + '\n' },
  { line: 13, text: LINES.slice(13, 17).join('\n') + '\n' },
];

const pos = (line: number, character: number) => ({ line, character });
const range = (line: number, from: number, to: number, endLine = line) => ({
  start: pos(line, from),
  end: pos(endLine, to),
});
type R = ReturnType<typeof range>;
const shift = (r: R, lines: number): R => ({
  start: pos(r.start.line + lines, r.start.character),
  end: pos(r.end.line + lines, r.end.character),
});

/** `text` with LSP `edits` applied. */
function applyEdits(text: string, edits: readonly TextEdit[]): string {
  const lines = text.split('\n');
  const offset = (p: { line: number; character: number }) =>
    lines.slice(0, p.line).reduce((n, l) => n + l.length + 1, 0) + p.character;
  let out = text;
  for (const e of [...edits].sort((a, b) => offset(b.range.start) - offset(a.range.start)))
    out = out.slice(0, offset(e.range.start)) + e.newText + out.slice(offset(e.range.end));
  return out;
}

/** Whether the server published anything for `uri`, once a later document's push arrived. */
async function publishedFor(client: Client, uri: string): Promise<boolean> {
  const marker = `file:///w/marker-${Math.random().toString(36).slice(2)}.mmd`;
  client.open(marker, 'flowchart LR\n  A --> B\n');
  await client.diagnostics(marker);
  client.close(marker);
  await client.diagnostics(marker);
  return client.published.some((p: PublishDiagnosticsParams) => p.uri === uri);
}

describe('Mermaid fences in a Markdown document (mermaid.markdown)', () => {
  let client: Client;
  const uri = 'file:///w/notes.md';
  const doc = { textDocument: { uri } };
  const request = <T>(method: string, params: object) =>
    client.connection.sendRequest<T>(method, params);

  beforeAll(async () => {
    client = await startClient({
      initializationOptions: MARKDOWN,
      capabilities: {
        textDocument: { documentSymbol: { hierarchicalDocumentSymbolSupport: true } },
      },
    });
  }, T);
  afterAll(async () => {
    await client.stop();
  }, T);

  it(
    'publishes the errors of both fences at their Markdown positions',
    async () => {
      client.open(uri, MD, 'markdown');
      const { diagnostics, version } = await client.diagnostics(uri);
      expect(version).toBe(1);
      // The `(` of each fence's last line.
      expect(diagnostics.map((d) => d.range.start)).toEqual([pos(7, 8), pos(16, 11)]);
      // The same body as a `.mmd` document gives the same errors, a fence's lines further up.
      const expected = [];
      for (const [i, f] of FENCES.entries()) {
        const oracle = `file:///w/fence-${i}.mmd`;
        client.open(oracle, f.text);
        const { diagnostics: own } = await client.diagnostics(oracle);
        expected.push(
          ...own.map((d) => ({
            ...d,
            range: shift(d.range, f.line),
            ...(d.relatedInformation && {
              relatedInformation: d.relatedInformation.map((r) => ({
                ...r,
                location: { uri, range: shift(r.location.range, f.line) },
              })),
            }),
          }))
        );
      }
      expect(diagnostics).toEqual(expected);
    },
    T
  );

  it('renames inside one fence, leaving the prose and the other fence alone', async () => {
    const at = { ...doc, position: pos(14, 5) };
    expect(await request('textDocument/prepareRename', at)).toEqual({
      range: range(14, 5, 6),
      placeholder: 'A',
    });
    const edit = await request<WorkspaceEdit>('textDocument/rename', { ...at, newName: 'Go' });
    expect(Object.keys(edit.changes!)).toEqual([uri]);
    expect(edit.changes![uri]).toEqual([
      { range: range(14, 5, 6), newText: 'Go' },
      { range: range(15, 11, 12), newText: 'Go' },
    ]);
    const renamed = [...LINES];
    renamed[14] = '     Go --> B';
    renamed[15] = '     B --> Go';
    expect(applyEdits(MD, edit.changes![uri]!)).toBe(renamed.join('\n'));
  });

  it('goes to definitions and references inside a fence', async () => {
    expect(
      await request<Location>('textDocument/definition', { ...doc, position: pos(16, 5) })
    ).toEqual({ uri, range: range(14, 11, 12) });
    expect(
      await request<Location[]>('textDocument/references', {
        ...doc,
        position: pos(15, 5),
        context: { includeDeclaration: true },
      })
    ).toEqual([
      { uri, range: range(14, 11, 12) },
      { uri, range: range(15, 5, 6) },
      { uri, range: range(16, 5, 6) },
    ]);
    // `X` lives in the first fence only.
    expect(
      await request<Location>('textDocument/definition', { ...doc, position: pos(7, 2) })
    ).toEqual({ uri, range: range(6, 8, 9) });
  });

  it('hovers and completes inside a fence, ids from that fence only', async () => {
    const hover = await request<Hover>('textDocument/hover', { ...doc, position: pos(6, 2) });
    expect(hover.range).toEqual(range(6, 2, 3));
    const items = await request<CompletionItem[]>('textDocument/completion', {
      ...doc,
      position: pos(15, 11),
    });
    const labels = items.map((i) => i.label);
    expect(labels).toEqual(expect.arrayContaining(['A', 'B']));
    expect(labels).not.toContain('X');
    const a = items.find((i) => i.label === 'A')!;
    expect(a.textEdit).toMatchObject({ range: range(15, 11, 12) });
  });

  it('highlights, selects and lists the outline inside the fences', async () => {
    expect(
      await request<DocumentHighlight[]>('textDocument/documentHighlight', {
        ...doc,
        position: pos(14, 5),
      })
    ).toEqual([
      { range: range(14, 5, 6), kind: DocumentHighlightKind.Write },
      { range: range(15, 11, 12), kind: DocumentHighlightKind.Text },
    ]);
    const [inFence, inProse] = await request<SelectionRange[]>('textDocument/selectionRange', {
      ...doc,
      positions: [pos(14, 5), pos(2, 0)],
    });
    const chain = (s: SelectionRange | undefined): unknown[] =>
      s ? [s.range, ...chain(s.parent)] : [];
    const steps = chain(inFence);
    expect(steps[0]).toEqual(range(14, 5, 6));
    // The widest step is the fence body, not the Markdown document.
    expect(steps.at(-1)).toEqual(range(13, 0, 0, 17));
    // Outside a fence: the empty range at the position, as LSP asks.
    expect(chain(inProse)).toEqual([range(2, 0, 0)]);
    const sym = (name: string, r: R, name_: R): DocumentSymbol => ({
      name,
      kind: SymbolKind.Variable,
      range: r,
      selectionRange: name_,
      children: [],
    });
    expect(await request<DocumentSymbol[]>('textDocument/documentSymbol', doc)).toEqual([
      sym('A', range(6, 2, 9), range(6, 2, 3)),
      sym('X', range(6, 2, 9), range(6, 8, 9)),
      sym('A', range(14, 5, 12), range(14, 5, 6)),
      sym('B', range(14, 5, 12), range(14, 11, 12)),
    ]);
  });

  it('answers nothing outside the fences', async () => {
    for (const position of [pos(2, 0), pos(4, 0), pos(10, 3), pos(19, 19)]) {
      const at = { ...doc, position };
      expect(await request('textDocument/definition', at)).toBeNull();
      expect(
        await request('textDocument/references', { ...at, context: { includeDeclaration: true } })
      ).toBeNull();
      expect(await request('textDocument/hover', at)).toBeNull();
      expect(await request('textDocument/completion', at)).toBeNull();
      expect(await request('textDocument/documentHighlight', at)).toBeNull();
      expect(await request('textDocument/prepareRename', at)).toBeNull();
      expect(await request('textDocument/rename', { ...at, newName: 'Z' })).toBeNull();
    }
  });

  it('leaves folding and semantic tokens of a Markdown document to the Markdown server', async () => {
    expect(await request('textDocument/foldingRange', doc)).toBeNull();
    expect(await request('textDocument/semanticTokens/full', doc)).toBeNull();
  });

  it(
    'follows edits: a fixed fence, prose added above, then no fence at all',
    async () => {
      const v = await request<unknown>('textDocument/hover', { ...doc, position: pos(6, 2) });
      expect(v).not.toBeNull();
      // Fix the first fence's `(`.
      client.edit(uri, 2, [{ range: range(7, 8, 9), text: 'Y' }]);
      expect((await client.diagnostics(uri)).diagnostics.map((d) => d.range.start)).toEqual([
        pos(16, 11),
      ]);
      // Two lines of prose above move the second fence's error down by two.
      client.edit(uri, 3, [{ range: range(1, 0, 0), text: 'More.\n\n' }]);
      expect((await client.diagnostics(uri)).diagnostics.map((d) => d.range.start)).toEqual([
        pos(18, 11),
      ]);
      client.change(uri, '# Notes\n\nNo diagrams here.\n', 4);
      expect((await client.diagnostics(uri)).diagnostics).toEqual([]);
      expect(await request('textDocument/hover', { ...doc, position: pos(0, 2) })).toBeNull();
      expect(await request('textDocument/documentSymbol', doc)).toEqual([]);
      client.close(uri);
      expect((await client.diagnostics(uri)).diagnostics).toEqual([]);
    },
    T
  );

  it(
    'gives a Markdown document with no fence no diagnostics and empty answers',
    async () => {
      const plain = 'file:///w/plain.md';
      client.open(
        plain,
        '# Title\n\nSome `mermaid` words, and code:\n\n```js\nA --> B\n```\n',
        'markdown'
      );
      expect((await client.diagnostics(plain)).diagnostics).toEqual([]);
      const at = { textDocument: { uri: plain }, position: pos(5, 0) };
      expect(await request('textDocument/definition', at)).toBeNull();
      expect(await request('textDocument/hover', at)).toBeNull();
      expect(await request('textDocument/completion', at)).toBeNull();
      expect(
        await request('textDocument/documentSymbol', { textDocument: { uri: plain } })
      ).toEqual([]);
      client.close(plain);
      await client.diagnostics(plain);
    },
    T
  );

  it(
    'serves .md, .markdown and .mdx files and language ids markdown and mdx, nothing else',
    async () => {
      const text = '```mermaid\nflowchart LR\n  A --> (\n```\n';
      const served: [string, string][] = [
        ['file:///w/a.markdown', 'plaintext'],
        ['file:///w/b.MDX', 'plaintext'],
        ['file:///w/c.md', 'plaintext'],
        ['untitled:Untitled-1', 'markdown'],
        ['untitled:Untitled-2', 'mdx'],
      ];
      for (const [u, languageId] of served) {
        client.open(u, text, languageId);
        expect((await client.diagnostics(u)).diagnostics.map((d) => d.range.start)).toEqual([
          pos(2, 8),
        ]);
        client.close(u);
        await client.diagnostics(u);
      }
      const ignored = 'file:///w/notes.txt';
      client.open(ignored, text, 'plaintext');
      expect(await publishedFor(client, ignored)).toBe(false);
      // A `.mmd` file stays a Mermaid document whatever its language id.
      const mmd = 'file:///w/flow.mmd';
      client.open(mmd, 'flowchart LR\n  A --> (\n', 'markdown');
      expect((await client.diagnostics(mmd)).diagnostics.map((d) => d.range.start)).toEqual([
        pos(1, 8),
      ]);
    },
    T
  );
});

describe('semantic tokens and folding in Markdown (mermaid.markdownTokensAndFolding)', () => {
  let client: Client;
  const uri = 'file:///w/folds.md';
  /** A fence from line 2 with a subgraph to fold. */
  const BODY = 'flowchart LR\n  subgraph S\n    A --> B\n  end\n  B --> C\n';
  const TEXT = `Intro\n\n\`\`\`mermaid\n${BODY}\`\`\`\n\nEnd with B.\n`;
  const request = <T>(method: string, params: object) =>
    client.connection.sendRequest<T>(method, params);

  beforeAll(async () => {
    client = await startClient({ initializationOptions: WITH_TOKENS });
    client.open(uri, TEXT, 'markdown');
    client.open('file:///w/body.mmd', BODY);
    await client.diagnostics(uri);
    await client.diagnostics('file:///w/body.mmd');
  }, T);
  afterAll(async () => {
    await client.stop();
  }, T);

  it('folds the fence as its body folds alone, three lines down', async () => {
    const own = await request<FoldingRange[]>('textDocument/foldingRange', {
      textDocument: { uri: 'file:///w/body.mmd' },
    });
    expect(own.length).toBeGreaterThan(0);
    expect(
      await request<FoldingRange[]>('textDocument/foldingRange', { textDocument: { uri } })
    ).toEqual(own.map((f) => ({ ...f, startLine: f.startLine + 3, endLine: f.endLine + 3 })));
  });

  it('colours the fence as its body alone, three lines down, and the prose not at all', async () => {
    const legend = client.init.capabilities.semanticTokensProvider!.legend;
    const decode = async (u: string) =>
      decodeTokens(
        (
          await request<SemanticTokens>('textDocument/semanticTokens/full', {
            textDocument: { uri: u },
          })
        ).data,
        legend
      );
    const own = await decode('file:///w/body.mmd');
    expect(own.length).toBeGreaterThan(0);
    expect(await decode(uri)).toEqual(own.map((t) => ({ ...t, line: t.line + 3 })));
  });
});

describe('Markdown without the option', () => {
  let client: Client;
  const uri = 'file:///w/notes.md';

  beforeAll(async () => {
    client = await startClient();
  }, T);
  afterAll(async () => {
    await client.stop();
  }, T);

  it(
    'serves no Markdown document, as before',
    async () => {
      client.open(uri, MD, 'markdown');
      expect(await publishedFor(client, uri)).toBe(false);
      const at = { textDocument: { uri }, position: pos(14, 5) };
      expect(await client.connection.sendRequest('textDocument/hover', at)).toBeNull();
      expect(await client.connection.sendRequest('textDocument/definition', at)).toBeNull();
      expect(
        await client.connection.sendRequest('textDocument/foldingRange', { textDocument: { uri } })
      ).toBeNull();
      expect(
        await client.connection.sendRequest('textDocument/semanticTokens/full', {
          textDocument: { uri },
        })
      ).toEqual({ data: [] });
    },
    T
  );

  it(
    'ignores markdownTokensAndFolding without markdown',
    async () => {
      const other = await startClient({
        initializationOptions: { mermaid: { markdownTokensAndFolding: true } },
      });
      try {
        other.open(uri, MD, 'markdown');
        expect(await publishedFor(other, uri)).toBe(false);
      } finally {
        await other.stop();
      }
    },
    T
  );
});
