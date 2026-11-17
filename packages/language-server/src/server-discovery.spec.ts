/**
 * Where the server looks for third-party facets (D157, D578, D579): with plugins on, in the
 * workspace folders the client names and in the nearest package root above each opened
 * document inside one of them, never in its working directory.
 */
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { PublishDiagnosticsParams } from 'vscode-languageserver-protocol';
import { describe, expect, it } from 'vitest';
import { type Client, startClient } from './testing/lsp-client.ts';
import { facetPackage, tree, under, workspace } from './testing/workspace.ts';

const T = 60_000;
const PLUGINS = { mermaid: { plugins: true } };

describe('plugin discovery without a workspace folder (D578)', () => {
  it(
    'scans nothing, not even the working directory, and logs one line',
    async () => {
      const cwd = workspace({ 'mermaid-fake': facetPackage('mermaid-fake', 'fake') });
      const client = await startClient({ cwd, initializationOptions: PLUGINS });
      try {
        client.open('file:///w/f.mmd', 'fake\n');
        const { diagnostics } = await client.diagnostics('file:///w/f.mmd');
        expect(diagnostics.map((d) => d.code)).toEqual(['UNSUPPORTED_DIAGRAM']);
        expect(client.logs.map((l) => l.message)).toEqual([
          'mermaid: plugins are on, but the client named no workspace folder: no plugins discovered',
        ]);
      } finally {
        await client.stop();
      }
      // The same directory as a workspace folder is scanned.
      const named = await startClient({
        cwd,
        rootUri: pathToFileURL(cwd).href,
        initializationOptions: PLUGINS,
      });
      try {
        named.open('file:///w/f.mmd', 'fake\n');
        const { diagnostics } = await named.diagnostics('file:///w/f.mmd');
        expect(diagnostics.map((d) => d.code)).toEqual(['FAKE_WARNING']);
        expect(named.logs).toEqual([]);
      } finally {
        await named.stop();
      }
    },
    T
  );
});

/** Where pnpm stores `mermaid-fake`; a workspace package links it into its own node_modules. */
const STORE = 'node_modules/.pnpm/mermaid-fake@1.0.0/node_modules/mermaid-fake';

/**
 * A pnpm workspace: the root package, and `packages/foo` whose own node_modules links the
 * `fake` plugin from the store (which the root's scan never enters: `.pnpm` is hidden) and
 * holds `mermaid-broken`, which each scan of `packages/foo` logs once (`mermaid-broken-top`
 * likewise for the workspace root). `packages/foo/docs`
 * has no package.json; `packages/foo/docs/inner` is a package with the `inner` plugin.
 */
function monorepo(): string {
  return tree({
    'package.json': JSON.stringify({
      name: 'mono',
      private: true,
      devDependencies: { 'mermaid-broken-top': '1.0.0' },
    }),
    'pnpm-workspace.yaml': "packages:\n  - 'packages/*'\n",
    ...under(STORE, facetPackage('mermaid-fake', 'fake')),
    ...under('node_modules/mermaid-broken-top', {
      ...facetPackage('mermaid-broken-top', 'top'),
      'detector.js': undefined,
    }),
    'packages/foo/package.json': JSON.stringify({
      name: 'foo',
      dependencies: { 'mermaid-fake': '1.0.0', 'mermaid-broken': '1.0.0' },
    }),
    'packages/foo/node_modules/mermaid-fake': { link: `../../../${STORE}` },
    ...under('packages/foo/node_modules/mermaid-broken', {
      ...facetPackage('mermaid-broken', 'broken'),
      'detector.js': undefined,
    }),
    'packages/foo/a.mmd': 'fake\n',
    'packages/foo/docs/b.mmd': 'fake\n',
    'packages/foo/docs/inner/package.json': JSON.stringify({
      name: 'inner',
      dependencies: { 'mermaid-inner': '1.0.0' },
    }),
    ...under(
      'packages/foo/docs/inner/node_modules/mermaid-inner',
      facetPackage('mermaid-inner', 'inner')
    ),
    'packages/foo/docs/inner/c.mmd': 'inner\n',
  });
}

const fileUri = (...path: string[]): string => pathToFileURL(join(...path)).href;
const codes = (p: PublishDiagnosticsParams): unknown[] => p.diagnostics.map((d) => d.code);

/** Waits for a push of `uri` whose codes are `expected`, passing the pushes before it. */
async function pushed(client: Client, uri: string, expected: unknown[]): Promise<void> {
  for (;;) {
    const p = await client.diagnostics(uri);
    if (JSON.stringify(codes(p)) === JSON.stringify(expected)) return;
  }
}

/** The codes of every push of `uri` so far, in order. */
const history = (client: Client, uri: string): unknown[][] =>
  client.published.filter((p) => p.uri === uri).map(codes);

const UNSUPPORTED = ['UNSUPPORTED_DIAGRAM'];
const FAKE = ['FAKE_WARNING'];

describe('plugin discovery in the package root of an opened document (D579)', () => {
  it(
    'finds a plugin in a nested pnpm workspace package once a document there opens',
    async () => {
      const root = monorepo();
      const client = await startClient({
        rootUri: pathToFileURL(root).href,
        initializationOptions: PLUGINS,
      });
      try {
        const doc = fileUri(root, 'packages/foo/a.mmd');
        client.open(doc, 'fake\n');
        // Pushed first without the plugin, then again once its package root is scanned.
        await pushed(client, doc, FAKE);
        expect(history(client, doc)).toEqual([UNSUPPORTED, FAKE]);
      } finally {
        await client.stop();
      }
    },
    T
  );

  it(
    'scans nothing for a document outside every workspace folder',
    async () => {
      const root = monorepo();
      const outside = tree({
        'package.json': JSON.stringify({
          name: 'elsewhere',
          dependencies: { 'mermaid-out': '1.0.0' },
        }),
        ...under('node_modules/mermaid-out', facetPackage('mermaid-out', 'out')),
        'x.mmd': 'out\n',
      });
      const client = await startClient({
        workspaceFolders: [{ uri: pathToFileURL(root).href, name: 'mono' }],
        initializationOptions: PLUGINS,
      });
      try {
        const away = fileUri(outside, 'x.mmd');
        const doc = fileUri(root, 'packages/foo/a.mmd');
        client.open(away, 'out\n');
        client.open(doc, 'fake\n');
        // Scanning packages/foo re-publishes every open document, `away` first.
        await pushed(client, doc, FAKE);
        expect(history(client, away)).toEqual([UNSUPPORTED, UNSUPPORTED]);
      } finally {
        await client.stop();
      }
    },
    T
  );

  it(
    'scans nothing when the package root lies above the workspace folder',
    async () => {
      const root = monorepo();
      // packages/foo/docs has no package.json: the root of b.mmd is packages/foo, outside it.
      const client = await startClient({
        workspaceFolders: [{ uri: fileUri(root, 'packages/foo/docs'), name: 'docs' }],
        initializationOptions: PLUGINS,
      });
      try {
        const doc = fileUri(root, 'packages/foo/docs/b.mmd');
        const inner = fileUri(root, 'packages/foo/docs/inner/c.mmd');
        client.open(doc, 'fake\n');
        client.open(inner, 'inner\n');
        await pushed(client, inner, FAKE);
        expect(history(client, doc)).toEqual([UNSUPPORTED, UNSUPPORTED]);
        expect(client.logs.filter((l) => l.message.includes('mermaid-broken'))).toEqual([]);
      } finally {
        await client.stop();
      }
    },
    T
  );

  it(
    'scans a root inside the named folder that holds the document, with folders nested',
    async () => {
      const root = monorepo();
      // b.mmd lies in both folders; its root packages/foo lies only in the outer one, which
      // holds the document too, so it is scanned. c.mmd's root lies in both.
      const client = await startClient({
        workspaceFolders: [
          { uri: fileUri(root, 'packages/foo/docs'), name: 'docs' },
          { uri: fileUri(root, 'packages/foo'), name: 'foo' },
        ],
        initializationOptions: PLUGINS,
      });
      try {
        const doc = fileUri(root, 'packages/foo/docs/b.mmd');
        client.open(doc, 'fake\n');
        await pushed(client, doc, FAKE);
        const inner = fileUri(root, 'packages/foo/docs/inner/c.mmd');
        client.open(inner, 'inner\n');
        await pushed(client, inner, FAKE);
      } finally {
        await client.stop();
      }
    },
    T
  );

  it(
    'falls back to rootPath when rootUri is not a file: URI (D578)',
    async () => {
      const root = monorepo();
      const client = await startClient({
        rootUri: 'vscode-vfs://github/mono',
        rootPath: join(root, 'packages/foo'),
        initializationOptions: PLUGINS,
      });
      try {
        const doc = fileUri(root, 'packages/foo/a.mmd');
        client.open(doc, 'fake\n');
        // The folder was scanned during initialize: the first push has the plugin.
        expect(codes(await client.diagnostics(doc))).toEqual(FAKE);
      } finally {
        await client.stop();
      }
    },
    T
  );

  it(
    'scans for a Markdown document and re-publishes its fences at Markdown positions (#811)',
    async () => {
      const root = monorepo();
      const client = await startClient({
        rootUri: pathToFileURL(root).href,
        initializationOptions: { mermaid: { plugins: true, markdown: true } },
      });
      try {
        const doc = fileUri(root, 'packages/foo/notes.md');
        client.open(doc, '# Notes\n\nSome prose.\n\n```mermaid\nfake\n```\n', 'markdown');
        await pushed(client, doc, FAKE);
        const pushes = client.published.filter((p) => p.uri === doc);
        expect(pushes.map(codes)).toEqual([UNSUPPORTED, FAKE]);
        // The rebuild's push keeps the version of the text it was made from.
        expect(pushes.map((p) => p.version)).toEqual([1, 1]);
        // The fence body starts on line 5: the facet's offsets 0–4 land there.
        expect(pushes[1]!.diagnostics[0]!.range).toEqual({
          start: { line: 5, character: 0 },
          end: { line: 5, character: 4 },
        });
      } finally {
        await client.stop();
      }
    },
    T
  );

  it(
    "keeps each open document's version in the rebuild's push (D579)",
    async () => {
      const root = monorepo();
      const client = await startClient({
        rootUri: pathToFileURL(root).href,
        initializationOptions: PLUGINS,
      });
      try {
        const other = fileUri(root, 'packages/foo/a.mmd');
        client.open(other, 'fake\n');
        await pushed(client, other, FAKE);
        client.change(other, 'fake\n\n', 7);
        await pushed(client, other, FAKE);
        const doc = fileUri(root, 'packages/foo/docs/inner/c.mmd');
        client.open(doc, 'inner\n');
        await pushed(client, doc, FAKE);
        // The rebuild re-published `other` (opened first) before `doc`, at the version it holds.
        await pushed(client, other, FAKE);
        expect(client.published.filter((p) => p.uri === other).map((p) => p.version)).toEqual([
          1, 1, 7, 7,
        ]);
      } finally {
        await client.stop();
      }
    },
    T
  );

  it(
    'scans each package root once per session',
    async () => {
      const root = monorepo();
      const client = await startClient({
        rootUri: pathToFileURL(root).href,
        initializationOptions: PLUGINS,
      });
      try {
        const a = fileUri(root, 'packages/foo/a.mmd');
        const b = fileUri(root, 'packages/foo/docs/b.mmd');
        client.open(a, 'fake\n');
        await pushed(client, a, FAKE);
        // packages/foo is scanned: b (same root) and a opened again get the plugin at once.
        client.open(b, 'fake\n');
        client.close(a);
        client.open(a, 'fake\n');
        await pushed(client, a, []);
        await pushed(client, a, FAKE);
        expect(history(client, b)).toEqual([FAKE]);
        // The workspace folder itself was scanned during initialize, not again for its own file.
        const top = fileUri(root, 'top.mmd');
        client.open(top, 'fake\n');
        await pushed(client, top, FAKE);
        // Scans run one at a time: once a new root's plugin shows, every earlier scan is done.
        const inner = fileUri(root, 'packages/foo/docs/inner/c.mmd');
        client.open(inner, 'inner\n');
        await pushed(client, inner, FAKE);
        const broken = client.logs.filter((l) => l.message.includes('mermaid-broken'));
        expect(broken.map((l) => l.message)).toEqual([
          'mermaid: mermaid-broken-top: "detector" (./detector.js) does not exist',
          'mermaid: mermaid-broken: "detector" (./detector.js) does not exist',
        ]);
      } finally {
        await client.stop();
      }
    },
    T
  );
});
