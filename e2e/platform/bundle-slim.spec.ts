/**
 * The slim bundle test (spec #867, D587): a `mermaid/slim` app whose `createMermaid` takes eight
 * first-party loaders, `{ flowchart: () => import('@mermaid-js/diagram-flowchart'), … }`, is
 * packed, installed and built with esbuild. Each diagram gets a chunk of its own, and a
 * chunk loads only when its diagram renders.
 */
import { cpSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { PLATFORM_DIR, chunkParts, installApp, recordScripts, serveDir } from './harness/index.ts';
import type { InstalledApp, StaticServer } from './harness/index.ts';

/**
 * Throws unless the scripts at `paths` hold only the app, the core, `@mermaid-js/shared` (the
 * diagram packages' common code) and the chunks of `diagrams`, and hold those of `required`.
 * `assertLoadedOnly` of the harness refuses `shared`, which every diagram package imports.
 */
function assertLoaded(
  dist: string,
  paths: readonly string[],
  diagrams: readonly string[],
  required: readonly string[] = []
): void {
  const allowed = new Set(['app', 'core', 'package:@mermaid-js/shared']);
  for (const d of diagrams) allowed.add(`diagram:${d}`);
  const loaded = new Set(paths.flatMap((p) => [...chunkParts(dist, p)]));
  expect([...loaded].filter((p) => !allowed.has(p))).toEqual([]);
  for (const d of required) expect(loaded, `the chunk of ${d}`).toContain(`diagram:${d}`);
}

/** The diagram ids of the page, in the order the test renders them. */
const DIAGRAMS = ['flowchart', 'class', 'er', 'sequence', 'state', 'pie', 'journey', 'timeline'];

test.describe('the slim app with eight lazy diagrams', () => {
  test.describe.configure({ mode: 'serial', timeout: 240_000 });
  let app: InstalledApp | undefined;
  let server: StaticServer | undefined;
  let dist = '';

  test.beforeAll(async () => {
    app = installApp('bundle-slim', { manager: 'pnpm' });
    cpSync(join(PLATFORM_DIR, 'bundle-slim'), app.dir, { recursive: true });
    app.run('pnpm', ['run', 'build']);
    dist = join(app.dir, 'dist');
    server = await serveDir(dist);
  });

  test.afterAll(async () => {
    await server?.close();
    app?.close();
  });

  test('builds eight separate diagram chunks, each loaded only when its diagram renders', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const scripts = recordScripts(page, server!.origin);
    await page.goto(server!.url('/slim.html'));
    await expect(page.locator('#status')).toHaveText('ready');
    await page.waitForLoadState('networkidle');
    // The detectors and the core are there; no diagram is.
    assertLoaded(dist, scripts.all, []);

    const rendered: string[] = [];
    for (const id of DIAGRAMS) {
      await page.evaluate(
        (d) => (window as unknown as Record<string, (d: string) => Promise<string>>).renderType(d),
        id
      );
      await expect(page.locator(`#${id} svg`)).toHaveCount(1);
      await page.waitForLoadState('networkidle');
      rendered.push(id);
      // This render loaded its own chunk, and nothing of a diagram not yet rendered.
      assertLoaded(dist, scripts.next(), rendered, [id]);
    }
    expect(errors).toEqual([]);

    // Eight chunks hold a diagram's code, and none holds the code of two diagrams.
    const diagramChunks = [...new Set(scripts.all)]
      .map((path) => ({
        path,
        diagrams: [...chunkParts(dist, path)].filter((p) => p.startsWith('diagram:')),
      }))
      .filter((c) => c.diagrams.length > 0);
    expect(diagramChunks.map((c) => c.diagrams.length)).toEqual(DIAGRAMS.map(() => 1));
    expect(new Set(diagramChunks.flatMap((c) => c.diagrams))).toEqual(
      new Set(DIAGRAMS.map((d) => `diagram:${d}`))
    );
  });
});
