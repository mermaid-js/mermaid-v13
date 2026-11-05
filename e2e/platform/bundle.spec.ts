/**
 * The R-PLUG-4 bundle test (spec #218, T3; D164): `mermaid` is packed, installed with pnpm
 * into one example app per bundler (Vite, webpack, Rollup, esbuild) and built. Playwright
 * records every script request: the one-flowchart page loads only the core and flowchart
 * chunks, and on the every-type page each type's chunk loads only when its diagram renders.
 * The pages are `bundle-pages/`, copied into each app before its build.
 */
import { cpSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import {
  PLATFORM_DIR,
  assertLoadedOnly,
  installApp,
  recordScripts,
  serveDir,
} from './harness/index.ts';
import type { InstalledApp, StaticServer } from './harness/index.ts';

const BUNDLERS = ['vite', 'webpack', 'rollup', 'esbuild'] as const;

/** The first-party diagram ids, in the order the every-type page renders them. */
const DIAGRAMS = ['flowchart', 'class', 'er', 'sequence', 'state'];

for (const bundler of BUNDLERS) {
  test.describe(`the ${bundler} app`, () => {
    // One install and build per app; the tests share them.
    test.describe.configure({ mode: 'serial', timeout: 240_000 });
    let app: InstalledApp | undefined;
    let server: StaticServer | undefined;
    let dist = '';

    test.beforeAll(async () => {
      app = installApp(`bundle-${bundler}`, { manager: 'pnpm' });
      cpSync(join(PLATFORM_DIR, 'bundle-pages'), app.dir, { recursive: true });
      app.run('pnpm', ['run', 'build']);
      dist = join(app.dir, 'dist');
      server = await serveDir(dist);
    });

    test.afterAll(async () => {
      await server?.close();
      app?.close();
    });

    test('the one-flowchart page loads only the core and flowchart chunks', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      const scripts = recordScripts(page, server!.origin);
      await page.goto(server!.url('/flowchart.html'));
      await expect(page.locator('#status')).toHaveText('rendered flowchart-v2');
      await expect(page.locator('#diagram svg [data-id="A"]')).toHaveCount(1);
      await page.waitForLoadState('networkidle');
      expect(errors).toEqual([]);
      assertLoadedOnly(dist, scripts.all, { diagrams: ['flowchart'], required: ['flowchart'] });
    });

    test('each type loads its chunk only when its diagram renders', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      const scripts = recordScripts(page, server!.origin);
      await page.goto(server!.url('/all.html'));
      await expect(page.locator('#status')).toHaveText('ready');
      await page.waitForLoadState('networkidle');
      assertLoadedOnly(dist, scripts.all, { diagrams: [] });

      const rendered: string[] = [];
      for (const id of DIAGRAMS) {
        await page.evaluate(
          (d) =>
            (window as unknown as Record<string, (d: string) => Promise<string>>).renderType(d),
          id
        );
        await expect(page.locator(`#${id} svg`)).toHaveCount(1);
        await page.waitForLoadState('networkidle');
        rendered.push(id);
        // This render loaded its own chunk, and nothing of a type not yet rendered.
        assertLoadedOnly(dist, scripts.next(), { diagrams: rendered, required: [id] });
        assertLoadedOnly(dist, scripts.all, { diagrams: rendered });
      }
      expect(errors).toEqual([]);
    });
  });
}
