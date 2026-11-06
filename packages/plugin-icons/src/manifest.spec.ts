// Activation (R-PLUG-5, D168): the package's `extension` manifest as discovery reads it, and a
// Node app with the package installed, found by the scan with no registration code.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readManifest } from '@mermaid-js/core';
import { build } from 'esbuild';
import { createMermaid } from 'mermaid';
import { scanPlugins } from 'mermaid/node-scan';
import { describe, expect, it } from 'vitest';
import { icons } from './index.ts';

const DIR = fileURLToPath(new URL('..', import.meta.url));
const pkg = JSON.parse(readFileSync(join(DIR, 'package.json'), 'utf8')) as {
  name: string;
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

  it('is found installed in a Node app, and its built entry activates', async () => {
    const app = realpathSync(mkdtempSync(join(tmpdir(), 'mmd-icons-')));
    const home = join(app, 'node_modules', '@mermaid-js', 'plugin-icons');
    mkdirSync(join(home, 'dist'), { recursive: true });
    writeFileSync(join(app, 'package.json'), JSON.stringify({ name: 'app', private: true }));
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
    const [found] = scan.packages;
    const discovered = await draw((m) =>
      m.registerExternalDiagrams([
        // As the Node discovery source hands it over (`node.ts`).
        { manifest: found!.raw, load: () => import(pathToFileURL(found!.files.entry).href) },
      ])
    );
    expect(discovered.warnings).toEqual([]);
    expect(discovered.svg).toBe((await draw((m) => m.registerExternalDiagrams([icons]))).svg);
  }, 30_000);
});
