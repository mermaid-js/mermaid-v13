/**
 * The pack-and-install smoke app (spec #218, T2; R-PLUG-4, R-PLUG-5, R-PLUG-7 infrastructure):
 * `mermaid` and the fixture plugins are packed with `pnpm pack`, installed from the tarballs
 * into a copy of `e2e/platform/smoke/` (npm and pnpm), bundled with esbuild and opened in the
 * browser. A packaging mistake (`exports`, `files`, a missing dependency) fails the app.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { installApp, serveDir } from './harness/index.ts';
import type { InstallOptions, PackageManager } from './harness/index.ts';

// Packing and installing runs once per worker; later runs reuse the cached install.
test.describe.configure({ timeout: 180_000 });

async function renders(page: Page, manager: PackageManager): Promise<void> {
  const app = installApp('smoke', { manager, build: 'build' });
  const server = await serveDir(join(app.dir, 'dist'));
  try {
    // The published layout, not the workspace: no sources in the installed package.
    expect(existsSync(join(app.dir, 'node_modules', 'mermaid', 'package.json'))).toBe(true);
    expect(existsSync(join(app.dir, 'node_modules', 'mermaid', 'src'))).toBe(false);
    expect(app.packed.map((p) => p.name)).toEqual(
      expect.arrayContaining([
        '@mermaid-js/core',
        '@mermaid-js/diagram-flowchart',
        'mermaid',
        'mermaid-fixture-diagram',
        'mermaid-fixture-extension',
      ])
    );

    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(server.url('/'));
    await expect(page.locator('#status')).toHaveText('rendered flowchart-v2 fixturebox');
    expect(errors).toEqual([]);
    // The flowchart, drawn by the lazily loaded flowchart chunk.
    await expect(page.locator('#flowchart svg [data-id="A"]')).toHaveCount(1);
    // The fixture diagram, detected by its manifest detector and loaded from its entry.
    await expect(page.locator('#fixture svg.fixturebox text')).toHaveText('packed');
    // The fixture extension's postRender hook ran on both renders.
    await expect(page.locator('svg.fixture-mark')).toHaveCount(2);
  } finally {
    await server.close();
    app.close();
  }
}

test('the smoke app renders from packed tarballs installed with npm', async ({ page }) => {
  await renders(page, 'npm');
});

test('the smoke app renders from packed tarballs installed with pnpm', async ({ page }) => {
  await renders(page, 'pnpm');
});

const broken: [string, RegExp, InstallOptions][] = [
  [
    'an exports map without the default condition',
    /Could not resolve "mermaid"/,
    {
      edit: {
        mermaid: (m) => ({ ...m, exports: { '.': { types: './dist/index.d.ts' } } }),
      },
    },
  ],
  [
    '"files" that leave out modules the entry imports',
    /Could not resolve/,
    { edit: { '@mermaid-js/diagram-flowchart': (m) => ({ ...m, files: ['dist/index.js'] }) } },
  ],
  [
    // pnpm's strict layout: an undeclared dependency does not resolve, and the copy pnpm
    // installs for the diagram packages' peer comes from the registry, not the tarball.
    'a dependency missing from package.json (pnpm)',
    /not the packed tarballs|Could not resolve "@mermaid-js\/core|@mermaid-js%2[Ff]core/,
    {
      manager: 'pnpm',
      edit: {
        mermaid: (m) => {
          const { '@mermaid-js/core': _core, ...dependencies } = m.dependencies ?? {};
          return { ...m, dependencies };
        },
      },
    },
  ],
];

for (const [mistake, error, opts] of broken) {
  test(`a package with ${mistake} fails the smoke app`, () => {
    expect(() => installApp('smoke', { ...opts, build: 'build' })).toThrow(error);
  });
}
