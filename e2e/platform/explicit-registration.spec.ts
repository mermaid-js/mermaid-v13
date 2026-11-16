/**
 * Explicit registration on four bundlers (spec #867, ticket 1; D585, D586): each T3 app
 * (`bundle-<bundler>/`) installs `mermaid` and the fixture diagram from tarballs (pnpm) and is
 * built WITHOUT the bundler plugin (`MERMAID_PLUGIN=off`). The explicit page
 * (`bundle-pages/explicit.html`) imports the fixture package's main export, a lazy descriptor,
 * and registers it with `registerExternalDiagrams([box])`. The detector is in the page's own
 * scripts, the entry in its own chunk that loads on the first render of the fixture diagram.
 */
import { cpSync } from 'node:fs';
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

const FLOWCHART = 'flowchart LR\n  A[Start] --> B[End]\n';

interface Drawn {
  readonly type?: string;
  readonly warnings?: readonly string[];
  readonly error?: string;
}

declare global {
  interface Window {
    draw(id: string, text: string): Promise<Drawn>;
  }
}

const draw = (page: Page, id: string, text: string): Promise<Drawn> =>
  page.evaluate(([i, t]) => window.draw(i, t), [id, text]);

/** Whether any of the served scripts at `paths` holds a source ending in `suffix`. */
const holds = (dist: string, paths: readonly string[], suffix: string): boolean =>
  paths.some((p) => chunkSources(dist, p).some((s) => s.endsWith(suffix)));

const FIXTURE_ENTRY = 'mermaid-fixture-diagram/entry.js';
const FIXTURE_DETECTOR = 'mermaid-fixture-diagram/detector.js';

for (const bundler of BUNDLERS) {
  test.describe(`explicit registration in the ${bundler} app`, () => {
    test.describe.configure({ mode: 'serial', timeout: 240_000 });
    let app: InstalledApp | undefined;
    let server: StaticServer | undefined;
    let dist = '';

    test.beforeAll(async () => {
      app = installApp(`bundle-${bundler}`, { manager: 'pnpm' });
      cpSync(join(PLATFORM_DIR, 'bundle-pages'), app.dir, { recursive: true });
      app.run('pnpm', ['run', 'build'], { env: { MERMAID_PLUGIN: 'off' } });
      dist = join(app.dir, 'dist');
      server = await serveDir(dist);
    });

    test.afterAll(async () => {
      await server?.close();
      app?.close();
    });

    test('renders the registered fixture diagram, its entry loaded on first render', async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      const scripts = recordScripts(page, server!.origin);
      await page.goto(server!.url('/explicit.html'));
      await expect(page.locator('#status')).toHaveText('ready');
      await page.waitForLoadState('networkidle');
      // The detector is in the page's own scripts; the entry is not.
      expect(holds(dist, scripts.next(), FIXTURE_DETECTOR)).toBe(true);
      expect(holds(dist, scripts.all, FIXTURE_ENTRY)).toBe(false);

      expect(await draw(page, 'flow', FLOWCHART)).toEqual({ type: 'flowchart-v2', warnings: [] });
      await page.waitForLoadState('networkidle');
      expect(holds(dist, scripts.all, FIXTURE_ENTRY)).toBe(false);

      expect(await draw(page, 'box', 'fixturebox registered in code')).toEqual({
        type: 'fixturebox',
        warnings: [],
      });
      await expect(page.locator('#box svg.fixturebox text')).toHaveText('registered in code');
      await page.waitForLoadState('networkidle');
      expect(holds(dist, scripts.next(), FIXTURE_ENTRY)).toBe(true);
      expect(errors).toEqual([]);
    });
  });
}
