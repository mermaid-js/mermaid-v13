/**
 * The CDN build (spec #218 T6; R-PLUG-7, D162, D163, D167). `mermaid` and the fixture plugins
 * are packed and installed into a copy of `e2e/platform/cdn/`; its `pages/` are served from one
 * origin and its `node_modules/` from a second one that stands in for the CDN (as unpkg serves
 * `mermaid/dist/…`). A third origin serves the same files as an alternative `cdnBase`.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { assertLoadedOnly, installApp, recordScripts, serveDir } from './harness/index.ts';
import type { InstalledApp, StaticServer } from './harness/index.ts';

test.describe.configure({ timeout: 180_000 });

const CORS = { 'access-control-allow-origin': '*' };

interface Site {
  app: InstalledApp;
  pages: StaticServer;
  cdn: StaticServer;
  other: StaticServer;
  close(): Promise<void>;
}

async function site(): Promise<Site> {
  const app = installApp('cdn');
  const modules = join(app.dir, 'node_modules');
  const cdn = await serveDir(modules, { headers: CORS });
  const other = await serveDir(modules, { headers: CORS });
  const pagesDir = join(app.dir, 'pages');
  for (const name of readdirSync(pagesDir)) {
    const file = join(pagesDir, name);
    writeFileSync(
      file,
      readFileSync(file, 'utf8').replaceAll('%CDN%', cdn.origin).replaceAll('%OTHER%', other.origin)
    );
  }
  const pages = await serveDir(pagesDir);
  return {
    app,
    pages,
    cdn,
    other,
    close: async () => {
      await Promise.all([pages.close(), cdn.close(), other.close()]);
      app.close();
    },
  };
}

/** Every script URL the page requests, from any origin. */
function allScripts(page: Page): string[] {
  const urls: string[] = [];
  page.on('request', (req) => {
    if (req.resourceType() === 'script') urls.push(req.url());
  });
  return urls;
}

/** What the pages reach as `globalThis.mermaid` (the loader's stand-in, then the module). */
interface PageMermaid {
  initialize(config: Record<string, unknown>): void;
  render(
    id: string,
    text: string
  ): Promise<{ svg: string; diagramType: string; warnings: { code: string; path?: string }[] }>;
}
interface PageGlobals {
  mermaid: PageMermaid;
  mermaidPlugins: unknown[];
}
interface FixtureModule {
  fixturebox: { parse(text: string): unknown };
}

let s: Site;
test.beforeEach(async () => {
  s = await site();
});
test.afterEach(async () => {
  await s.close();
});

test('the classic mermaid.min.js tag renders a flowchart with startOnLoad, loading only core and flowchart from the CDN', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const scripts = allScripts(page);
  const fromCdn = recordScripts(page, s.cdn.origin);
  await page.goto(s.pages.url('/flowchart.html'));
  await expect(page.locator('pre.mermaid svg [data-id="A"]')).toHaveCount(1);
  await page.waitForLoadState('networkidle');
  expect(errors).toEqual([]);
  // Every script came from the CDN's mermaid directory: the loader, the ESM build, its chunks.
  expect(scripts.length).toBeGreaterThan(2);
  for (const url of scripts)
    expect(url.startsWith(`${s.cdn.origin}/mermaid/dist/`), url).toBe(true);
  expect(fromCdn.all).toEqual(
    expect.arrayContaining([
      '/mermaid/dist/mermaid.min.js',
      '/mermaid/dist/mermaid.esm.min.mjs',
      '/mermaid/dist/chunks/diagram-flowchart.mjs',
    ])
  );
  assertLoadedOnly(join(s.app.dir, 'node_modules'), fromCdn.all, {
    diagrams: ['flowchart'],
    required: ['flowchart'],
  });
});

test('cdnBase in front matter or %%{init}%% warns as a secure key and leads to no request', async ({
  page,
}) => {
  const fromCdn = recordScripts(page, s.cdn.origin);
  await page.goto(s.pages.url('/api.html'));
  const elsewhere = s.other.url('/mermaid/dist/');
  const warnings = await page.evaluate(async (base) => {
    const m = (globalThis as unknown as PageGlobals).mermaid;
    const front = await m.render(
      'a',
      `---\nconfig:\n  cdnBase: ${base}\n---\nclassDiagram\n  A <|-- B`
    );
    const init = await m.render(
      'b',
      `%%{init: {"cdnBase": "${base}"}}%%\nsequenceDiagram\n  A->>B: hi`
    );
    return [...front.warnings, ...init.warnings].map((w) => [w.code, w.path]);
  }, elsewhere);
  expect(warnings).toEqual([
    ['CONFIG_SECURE_KEY', 'cdnBase'],
    ['CONFIG_SECURE_KEY', 'cdnBase'],
  ]);
  await page.waitForLoadState('networkidle');
  expect(s.other.requests).toEqual([]);
  expect(fromCdn.all).toEqual(
    expect.arrayContaining([
      '/mermaid/dist/chunks/diagram-class.mjs',
      '/mermaid/dist/chunks/diagram-sequence.mjs',
    ])
  );
});

test('initialize({ cdnBase }) moves the first-party chunk loads to that base, with a warning', async ({
  page,
}) => {
  const warnings: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'warning') warnings.push(m.text());
  });
  const fromCdn = recordScripts(page, s.cdn.origin);
  const fromOther = recordScripts(page, s.other.origin);
  await page.goto(s.pages.url('/api.html'));
  const svg = await page.evaluate(async (base) => {
    const m = (globalThis as unknown as PageGlobals).mermaid;
    m.initialize({ startOnLoad: false, cdnBase: base, theme: 'forest' });
    return (await m.render('s', 'stateDiagram-v2\n  [*] --> Still')).svg;
  }, s.other.url('/mermaid/dist?v=1#base'));
  expect(svg).toContain('<svg');
  expect(fromOther.all).toEqual(
    expect.arrayContaining([
      '/mermaid/dist/chunks/diagram-state.mjs',
      '/mermaid/dist/chunks/core-theme-specs-forest.mjs',
    ])
  );
  expect(fromCdn.all.filter((p) => p.includes('diagram-state') || p.includes('forest'))).toEqual(
    []
  ); // Not the entry's own directory: core's shared chunks load a second copy from there.
  expect(warnings).toEqual([expect.stringMatching(/second copy/)]);
});

test('plugin scripts placed before and after mermaid both register, and later pushes too', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(s.pages.url('/plugins.html'));
  // The diagram queued before mermaid drew; the extension queued after it marked both renders.
  await expect(page.locator('pre.mermaid svg.fixturebox text')).toHaveText('before');
  await expect(page.locator('pre.mermaid svg.fixture-mark')).toHaveCount(2);
  // After startup, push registers at once.
  const late = await page.evaluate(async (cdn) => {
    const g = globalThis as unknown as PageGlobals;
    g.mermaidPlugins.push({
      package: 'late-box',
      id: 'latebox',
      detector: (text: string) => /^\s*latebox\b/.test(text),
      loader: async () => {
        const m = (await import(`${cdn}/mermaid-fixture-diagram/entry.js`)) as FixtureModule;
        return {
          ...m.fixturebox,
          id: 'latebox',
          parse: (t: string) => m.fixturebox.parse(t.replace('latebox', 'fixturebox')),
        };
      },
    });
    const r = await g.mermaid.render('late', 'latebox pushed');
    return { type: r.diagramType, svg: r.svg };
  }, s.cdn.origin);
  expect(late.type).toBe('latebox');
  expect(late.svg).toContain('pushed');
  expect(errors).toEqual([]);
});

test('data-cdn-base loads the whole build from the mirror, with no module loaded twice', async ({
  page,
}) => {
  const errors: string[] = [];
  const warnings: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'warning') warnings.push(m.text());
  });
  const scripts = allScripts(page);
  const fromOther = recordScripts(page, s.other.origin);
  await page.goto(s.pages.url('/mirror.html'));
  await expect(page.locator('pre.mermaid svg [data-id="A"]')).toHaveCount(1);
  await page.waitForLoadState('networkidle');
  expect(errors).toEqual([]);
  expect(warnings).toEqual([]);
  // The loader from the CDN origin; everything else from the mirror.
  expect(scripts[0]).toBe(`${s.cdn.origin}/mermaid/dist/mermaid.min.js`);
  for (const url of scripts.slice(1))
    expect(url.startsWith(`${s.other.origin}/mermaid/dist/`), url).toBe(true);
  const paths = scripts.map((u) => new URL(u).pathname);
  expect(new Set(paths).size, paths.join('\n')).toBe(paths.length);
  expect(fromOther.all).toEqual(
    expect.arrayContaining([
      '/mermaid/dist/mermaid.esm.min.mjs',
      '/mermaid/dist/chunks/diagram-flowchart.mjs',
    ])
  );
  assertLoadedOnly(join(s.app.dir, 'node_modules'), fromOther.all, {
    diagrams: ['flowchart'],
    required: ['flowchart'],
  });
});
