/**
 * Where the server looks for third-party facets (D157, D578): with plugins on, only in the
 * workspace folders the client names, never in its working directory.
 */
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { startClient } from './testing/lsp-client.ts';
import { facetPackage, workspace } from './testing/workspace.ts';

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
