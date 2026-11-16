/**
 * The language server as npm installs it (#812, R-LANG-2, D98): `@mermaid-js/language-server`
 * and everything it depends on are packed with `pnpm pack` and installed from the tarballs
 * into a copy of `e2e/platform/language-server/`. The installed bin
 * (`node_modules/.bin/mermaid-language-server`, the built `dist/cli.js` through its shebang)
 * then serves a scripted LSP session over stdio. A packaging mistake (`bin`, `files`,
 * `exports` of a diagram facet, a dependency) or a bin that cannot start fails it. The unit
 * specs (`packages/language-server`) run the sources through tsx instead.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { runCli, startClient } from '../../packages/language-server/src/testing/lsp-client.ts';
import { installApp } from './harness/index.ts';

// Packing and installing runs once per worker; later runs reuse the cached install.
test.describe.configure({ timeout: 180_000 });

const SEQUENCE = 'sequenceDiagram\n  Alice->>Bob: Hello\n  Bob-->>Alice: Hi\n  Bob->>\n';

test('the installed mermaid-language-server bin serves a sequence diagram', async () => {
  const app = installApp('language-server');
  try {
    const bin = { path: join(app.dir, 'node_modules', '.bin', 'mermaid-language-server') };
    const installed = join(app.dir, 'node_modules', '@mermaid-js', 'language-server');
    const { version } = JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8')) as {
      version: string;
    };
    expect(await runCli(['--version'], bin)).toMatchObject({ code: 0, stdout: `${version}\n` });

    const client = await startClient({ bin });
    try {
      expect(client.init.serverInfo).toEqual({ name: 'mermaid-language-server', version });
      const uri = 'file:///smoke/seq.mmd';
      client.open(uri, SEQUENCE);
      // The last line leaves a message without its target: one error, on line 3.
      const { diagnostics, version: answered } = await client.diagnostics(uri);
      expect(answered).toBe(1);
      expect(diagnostics.length).toBeGreaterThan(0);
      expect(diagnostics[0]).toMatchObject({ severity: 1, source: 'mermaid' });
      expect(diagnostics[0].range.start.line).toBe(3);
      // `Alice` on line 1: the sequence facet's hover, loaded from the installed package.
      const hover = await client.connection.sendRequest<{ contents: { value: string } } | null>(
        'textDocument/hover',
        { textDocument: { uri }, position: { line: 1, character: 3 } }
      );
      expect(hover?.contents.value).toContain('Alice');
    } finally {
      expect(await client.stop()).toBe(0);
    }
  } finally {
    app.close();
  }
});
