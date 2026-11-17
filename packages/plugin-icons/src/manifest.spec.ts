// Activation (R-PLUG-5, D168, D590): the package's `extension` manifest as `autoload` reads it,
// and a Node app that declares the package, registered by `await autoload(mermaid)` alone.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readManifest } from '@mermaid-js/core';
import { build } from 'esbuild';
import { autoload, scanPlugins } from '@mermaid-js/plugin-autoload';
import { createMermaid } from 'mermaid';
import { describe, expect, it } from 'vitest';
import { icons } from './index.ts';

const DIR = fileURLToPath(new URL('..', import.meta.url));
const pkg = JSON.parse(readFileSync(join(DIR, 'package.json'), 'utf8')) as {
  name: string;
  version: string;
  mermaid: unknown;
};
const BELL = {
  prefix: 'x',
  width: 512,
  height: 512,
  icons: { bell: { body: '<path fill="currentColor" d="M0 0H448V512z"/>', width: 448 } },
};
const FLOW = 'flowchart LR\n  A["ring fa:fa-bell"] --> B@{ icon: "fa:bell", form: "circle" }';

async function draw(register: (m: ReturnType<typeof createMermaid>) => Promise<unknown>) {
  const m = createMermaid();
  m.initialize({ deterministic: true, discovery: false });
  m.registerIconPacks([{ name: 'fa', icons: BELL }]);
  await register(m);
  return m.render('i', FLOW);
}

describe('the extension manifest', () => {
  it('names the entry and its export', () => {
    expect(readManifest(pkg.mermaid)).toEqual({
      plugin: 'extension',
      id: 'icons',
      entry: './dist/index.js',
      export: 'icons',
    });
  });

  it('activates by manifest as registerExternalDiagrams([icons]) does', async () => {
    const explicit = await draw((m) => m.registerExternalDiagrams([icons]));
    const byManifest = await draw((m) =>
      m.registerExternalDiagrams([{ manifest: pkg.mermaid, load: () => import('./index.ts') }])
    );
    expect(explicit.warnings).toEqual([]);
    expect(explicit.svg).toContain('d="M0 0H448V512z"');
    expect(byManifest.svg).toBe(explicit.svg);
  });

  it('is found declared and installed in a Node app, and its built entry activates', async () => {
    const app = realpathSync(mkdtempSync(join(tmpdir(), 'mmd-icons-')));
    const home = join(app, 'node_modules', '@mermaid-js', 'plugin-icons');
    mkdirSync(join(home, 'dist'), { recursive: true });
    // The scan reads only the packages the app declares (D589).
    writeFileSync(
      join(app, 'package.json'),
      JSON.stringify({ name: 'app', private: true, dependencies: { [pkg.name]: pkg.version } })
    );
    cpSync(join(DIR, 'package.json'), join(home, 'package.json'));
    // The entry as a bundle with core inlined, so the app needs nothing else installed.
    await build({
      entryPoints: [join(DIR, 'src/index.ts')],
      outfile: join(home, 'dist/index.js'),
      bundle: true,
      format: 'esm',
      platform: 'neutral',
      conditions: ['mermaid-source'],
      logLevel: 'silent',
    });
    const scan = await scanPlugins(app);
    expect(scan.warnings).toEqual([]);
    expect(scan.packages.map((p) => [p.package, p.manifest.plugin])).toEqual([
      [pkg.name, 'extension'],
    ]);
    // Registered by autoload alone, from the app's own install (the built entry above).
    const discovered = await draw(async (m) =>
      expect(await autoload(m, { root: app })).toEqual([])
    );
    expect(discovered.warnings).toEqual([]);
    expect(discovered.svg).toBe((await draw((m) => m.registerExternalDiagrams([icons]))).svg);
  }, 30_000);
});
