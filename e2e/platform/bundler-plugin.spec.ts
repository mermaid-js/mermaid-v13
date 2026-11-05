/**
 * `@mermaid-js/bundler-plugin` on four bundlers (spec #218, T5; D164, D169, R-PLUG-5): each
 * T3 app (`bundle-<bundler>/`) installs `mermaid`, the fixture diagram and extension and
 * `@mermaid-js/plugin-interactions` from tarballs (pnpm), and is built twice: with
 * `plugins: [mermaid()]` and without (`MERMAID_PLUGIN=off`). The plugin page
 * (`bundle-pages/plugin.html`) has no registration code. With the plugin, the fixture diagram
 * renders, its entry in a chunk that loads only on its first render; the fixture extension
 * marks every svg; click callbacks fire. Without it, the fixture type is UNSUPPORTED_DIAGRAM.
 */
import { cpSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import {
  PLATFORM_DIR,
  chunkSources,
  installApp,
  recordScripts,
  serveDir,
} from './harness/index.ts';
import type { InstalledApp, StaticServer } from './harness/index.ts';

const BUNDLERS = ['vite', 'webpack', 'rollup', 'esbuild'] as const;

const FLOWCHART = 'flowchart LR\n  A[Start] --> B[End]\n  click A callback "tip"\n';

interface Drawn {
  readonly type?: string;
  readonly warnings?: readonly string[];
  readonly error?: string;
}

declare global {
  interface Window {
    draw(id: string, text: string): Promise<Drawn>;
    calls: unknown[][];
  }
}

const draw = (page: Page, id: string, text: string): Promise<Drawn> =>
  page.evaluate(([i, t]) => window.draw(i, t), [id, text]);

/** Whether any of the served scripts at `paths` holds a source ending in `suffix`. */
const holds = (dist: string, paths: readonly string[], suffix: string): boolean =>
  paths.some((p) => chunkSources(dist, p).some((s) => s.endsWith(suffix)));

const FIXTURE_ENTRY = 'mermaid-fixture-diagram/index.js';
const FIXTURE_DETECTOR = 'mermaid-fixture-diagram/detector.js';

for (const bundler of BUNDLERS) {
  test.describe(`mermaid() in the ${bundler} app`, () => {
    test.describe.configure({ mode: 'serial', timeout: 240_000 });
    let app: InstalledApp | undefined;
    let on: StaticServer | undefined;
    let off: StaticServer | undefined;
    let dist = '';

    test.beforeAll(async () => {
      app = installApp(`bundle-${bundler}`, { manager: 'pnpm' });
      cpSync(join(PLATFORM_DIR, 'bundle-pages'), app.dir, { recursive: true });
      app.run('pnpm', ['run', 'build'], { env: { MERMAID_PLUGIN: 'off' } });
      renameSync(join(app.dir, 'dist'), join(app.dir, 'dist-off'));
      app.run('pnpm', ['run', 'build']);
      dist = join(app.dir, 'dist');
      on = await serveDir(dist);
      off = await serveDir(join(app.dir, 'dist-off'));
    });

    test.afterAll(async () => {
      await on?.close();
      await off?.close();
      app?.close();
    });

    test('renders the discovered fixture diagram, its entry loaded lazily', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      const scripts = recordScripts(page, on!.origin);
      await page.goto(on!.url('/plugin.html'));
      await expect(page.locator('#status')).toHaveText('ready');
      await page.waitForLoadState('networkidle');
      // The detector is in the page's own scripts; the entry is not.
      expect(holds(dist, scripts.next(), FIXTURE_DETECTOR)).toBe(true);

      expect(await draw(page, 'flow', FLOWCHART)).toEqual({ type: 'flowchart-v2', warnings: [] });
      await page.waitForLoadState('networkidle');
      expect(holds(dist, scripts.all, FIXTURE_ENTRY)).toBe(false);

      expect(await draw(page, 'box', 'fixturebox from the bundle')).toEqual({
        type: 'fixturebox',
        warnings: [],
      });
      await expect(page.locator('#box svg.fixturebox text')).toHaveText('from the bundle');
      await page.waitForLoadState('networkidle');
      expect(holds(dist, scripts.next(), FIXTURE_ENTRY)).toBe(true);
      expect(errors).toEqual([]);
    });

    test('activates the discovered extensions: marks and click callbacks', async ({ page }) => {
      await page.goto(on!.url('/plugin.html'));
      await expect(page.locator('#status')).toHaveText('ready');
      expect((await draw(page, 'flow', FLOWCHART)).warnings).toEqual([]);
      // mermaid-fixture-extension's postRender hook.
      await expect(page.locator('#flow svg.fixture-mark')).toHaveCount(1);
      // plugin-interactions (D169): `click A callback` calls window.callback('A').
      await page.locator('#flow g.node[data-id="A"]').click();
      await page.locator('#flow g.node[data-id="B"]').click();
      expect(await page.evaluate(() => window.calls)).toEqual([['A']]);
    });

    test('without the plugin, the fixture type is UNSUPPORTED_DIAGRAM', async ({ page }) => {
      await page.goto(off!.url('/plugin.html'));
      await expect(page.locator('#status')).toHaveText('ready');
      expect(await draw(page, 'box', 'fixturebox from the bundle')).toEqual({
        error: 'UNSUPPORTED_DIAGRAM',
      });
      const flow = await draw(page, 'flow', FLOWCHART);
      expect(flow.type).toBe('flowchart-v2');
      await expect(page.locator('#flow svg.fixture-mark')).toHaveCount(0);
    });

    if (bundler === 'webpack')
      test('a persistent-cache rebuild sees a removed plugin', async ({ page }) => {
        const env = { MERMAID_CACHE: '1' };
        app!.run('pnpm', ['run', 'build'], { env });
        // What `pnpm remove mermaid-fixture-diagram` leaves: the link gone, pnpm's marker rewritten.
        rmSync(join(app!.dir, 'node_modules', 'mermaid-fixture-diagram'), { recursive: true });
        writeFileSync(join(app!.dir, 'node_modules', '.modules.yaml'), '# rewritten\n', {
          flag: 'a',
        });
        app!.run('pnpm', ['run', 'build'], { env });
        const server = await serveDir(join(app!.dir, 'dist'));
        try {
          await page.goto(server.url('/plugin.html'));
          await expect(page.locator('#status')).toHaveText('ready');
          expect(await draw(page, 'box', 'fixturebox gone')).toEqual({
            error: 'UNSUPPORTED_DIAGRAM',
          });
        } finally {
          await server.close();
        }
      });
  });
}
