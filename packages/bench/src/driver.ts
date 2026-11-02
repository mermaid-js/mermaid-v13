/**
 * Node side of the harness: builds the runner site, serves it on loopback, and drives one
 * Chromium page per renderer through Playwright (approaches harness `scripts/bench.mjs`).
 *
 * Isolation: every renderer gets its own browser context (own process and cache). "Ready at" is
 * taken on a reload, so the HTTP cache is warm, as in the approaches harness.
 */
import { readFileSync, realpathSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { build } from 'esbuild';
import { benchDefine, bundle, sizeOf } from './build.ts';
import type { Bundle } from './build.ts';
import type { Fixture } from './fixtures.ts';
import { stripMermaidOnlyConfig } from './normalize.ts';
import { emptyStages, STAGES } from './report.ts';
import type { DiagramResult, RendererId, RendererRun, SizeSummary, SizedFile } from './report.ts';
import type { BenchWindow, ReadyInfo, RenderReply } from './runner/protocol.ts';
import { median, quantile } from './stats.ts';

const PKG = fileURLToPath(new URL('../', import.meta.url));
export const SITE_DIR = join(PKG, 'dist', 'site');

export interface Site {
  v13: Bundle;
  stages: Bundle;
  /** URL path prefix → directory on disk. */
  roots: Record<string, string>;
}

function moduleDir(alias: string): string {
  return realpathSync(join(PKG, 'node_modules', alias));
}

export function versionOf(id: RendererId): string {
  const dir =
    id === 'v13' || id === 'v13-stages'
      ? join(PKG, '..', 'mermaid')
      : moduleDir(id === 'v12-frozen' ? 'mermaid-v12-frozen' : 'mermaid-v12');
  return (JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { version: string })
    .version;
}

/** Builds the runner script and both v13 bundles into `dist/site`. */
export async function buildSite(): Promise<Site> {
  rmSync(SITE_DIR, { recursive: true, force: true });
  const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));
  await build({
    entryPoints: [src('./runner/harness.ts')],
    outfile: join(SITE_DIR, 'harness', 'harness.js'),
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    conditions: ['mermaid-source'],
    define: benchDefine(false),
    logLevel: 'warning',
  });
  const v13 = await bundle({
    entry: src('../../mermaid/src/index.ts'),
    outdir: join(SITE_DIR, 'v13'),
    bench: false,
  });
  const stages = await bundle({
    entry: src('./runner/v13-stages-entry.ts'),
    outdir: join(SITE_DIR, 'v13-stages'),
    bench: true,
  });
  return {
    v13,
    stages,
    roots: {
      '/harness/': join(SITE_DIR, 'harness'),
      '/r/v13/': join(SITE_DIR, 'v13'),
      '/r/v13-stages/': join(SITE_DIR, 'v13-stages'),
      '/r/v12-frozen/': join(moduleDir('mermaid-v12-frozen'), 'dist'),
      '/r/v12-current/': join(moduleDir('mermaid-v12'), 'dist'),
    },
  };
}

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>bench runner</title></head>
<body><div id="stage"></div><script type="module" src="/harness/harness.js"></script></body></html>`;

// Cross-origin isolation lifts the browser's timer coarsening (100 µs → 5 µs), which per-stage
// timing of sub-millisecond renders needs. Everything is served from one origin, so it is free.
const ISOLATION = {
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-embedder-policy': 'require-corp',
};

const TYPES: Record<string, string> = {
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
};

export interface Server {
  origin: string;
  /** Size of a served file by URL path; undefined if it is not one of the served roots. */
  size(urlPath: string): SizedFile | undefined;
  close(): Promise<void>;
}

export async function serve(site: Site): Promise<Server> {
  const sizes = new Map<string, SizedFile>();
  const fileFor = (urlPath: string): string | undefined => {
    for (const [prefix, dir] of Object.entries(site.roots)) {
      if (!urlPath.startsWith(prefix)) continue;
      const file = normalize(join(dir, decodeURIComponent(urlPath.slice(prefix.length))));
      if (!file.startsWith(dir)) return undefined;
      try {
        return statSync(file).isFile() ? file : undefined;
      } catch {
        return undefined;
      }
    }
    return undefined;
  };
  const server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://x').pathname;
    if (path === '/') {
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        ...ISOLATION,
      });
      res.end(PAGE);
      return;
    }
    const file = fileFor(path);
    if (!file) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, {
      'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
      'cache-control': 'max-age=3600',
      ...ISOLATION,
    });
    res.end(readFileSync(file));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${port}`,
    size(urlPath) {
      let s = sizes.get(urlPath);
      if (!s) {
        const file = fileFor(urlPath);
        if (!file) return undefined;
        s = sizeOf(urlPath, readFileSync(file));
        sizes.set(urlPath, s);
      }
      return s;
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function summarise(files: SizedFile[], source: SizeSummary['source']): SizeSummary {
  const total = (k: 'raw' | 'gzip' | 'brotli') => files.reduce((a, f) => a + f[k], 0);
  return { raw: total('raw'), gzip: total('gzip'), brotli: total('brotli'), source, files };
}

export interface DriveOptions {
  browser: Browser;
  server: Server;
  site: Site;
  renderer: RendererId;
  fixtures: Fixture[];
  reps: number;
  budgetMs: number;
  timeoutMs: number;
  liftLimits: boolean;
  strip: boolean;
  log(line: string): void;
}

type BenchPage = { page: Page; context: BrowserContext; ready: ReadyInfo };

async function openRunner(o: DriveOptions): Promise<BenchPage> {
  const context = await o.browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => o.log(`  [${o.renderer} page error] ${e.message}`));
  const url = `${o.server.origin}/?r=${o.renderer}&liftLimits=${o.liftLimits}`;
  const readyInfo = () =>
    page.evaluate(() => (window as unknown as { __bench: BenchWindow }).__bench.ready);
  await page.goto(url);
  await page.waitForFunction(
    () => 'undefined' !== typeof (window as unknown as { __bench?: unknown }).__bench
  );
  await readyInfo();
  // Measure on a reload, with the HTTP cache warm.
  await page.reload();
  await page.waitForFunction(
    () => 'undefined' !== typeof (window as unknown as { __bench?: unknown }).__bench
  );
  return { page, context, ready: await readyInfo() };
}

function result(f: Fixture, status: DiagramResult['status'], error?: string): DiagramResult {
  return {
    id: f.id,
    set: f.set,
    status,
    ...(error !== undefined && { error }),
    firstMs: null,
    warmMs: null,
    p95Ms: null,
    batch: 0,
    samples: 0,
    stages: emptyStages(),
  };
}

function fromReply(f: Fixture, reply: RenderReply): DiagramResult {
  if (!reply.ok) return result(f, 'error', reply.error);
  const stages = emptyStages();
  for (const s of STAGES) stages[s] = median(reply.stageSamples[s] ?? []);
  return {
    id: f.id,
    set: f.set,
    status: 'ok',
    firstMs: reply.firstMs,
    warmMs: median(reply.samples),
    p95Ms: quantile(reply.samples, 0.95),
    batch: reply.batch,
    samples: reply.samples.length,
    stages,
  };
}

/** Runs every fixture through one renderer. */
export async function drive(o: DriveOptions): Promise<RendererRun> {
  const version = versionOf(o.renderer);
  let runner = await openRunner(o);
  const base: Omit<RendererRun, 'status' | 'results'> = {
    renderer: o.renderer,
    version,
    readyAtMs: null,
    initMs: null,
    size: null,
  };
  const v13Static = (): SizeSummary | null =>
    o.renderer === 'v13'
      ? summarise(
          o.site.v13.files.filter((f) => o.site.v13.staticClosure.includes(f.path)),
          'static'
        )
      : null;

  if (!runner.ready.ok) {
    const { missing, error } = runner.ready;
    await runner.context.close();
    o.log(`  ${o.renderer}: ${missing ? 'pipeline missing' : 'init failed'}: ${error}`);
    return {
      ...base,
      status: missing ? 'missing' : 'init-error',
      error,
      size: v13Static(),
      results: o.fixtures.map((f) => result(f, missing ? 'missing' : 'error', error)),
    };
  }

  const prefix = `/r/${o.renderer}/`;
  const loaded = runner.ready.resources
    .map((r) => new URL(r.name).pathname)
    .filter((p) => p.startsWith(prefix))
    .map((p) => o.server.size(p))
    .filter((s): s is SizedFile => s !== undefined);
  const run: RendererRun = {
    ...base,
    status: 'ready',
    readyAtMs: runner.ready.readyAt,
    initMs: runner.ready.initMs,
    size: loaded.length > 0 ? summarise(loaded, 'loaded') : v13Static(),
    results: [],
  };

  for (const [i, f] of o.fixtures.entries()) {
    const source = o.strip ? stripMermaidOnlyConfig(f.source).source : f.source;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<'timeout'>(
      (resolve) => (timer = setTimeout(() => resolve('timeout'), o.timeoutMs))
    );
    const reply = await Promise.race([
      runner.page
        .evaluate(
          ([s, r, b]) => (window as unknown as { __bench: BenchWindow }).__bench.render(s, r, b),
          [source, o.reps, o.budgetMs] as const
        )
        .catch(
          (e: unknown): RenderReply => ({
            ok: false,
            error: e instanceof Error ? e.message : String(e),
          })
        ),
      timeout,
    ]);
    clearTimeout(timer);
    if (reply === 'timeout') {
      run.results.push(result(f, 'timeout', `no result within ${o.timeoutMs} ms`));
      // The page is still busy with this diagram; start a fresh one for the rest.
      await runner.context.close();
      runner = await openRunner(o);
    } else {
      run.results.push(fromReply(f, reply));
    }
    const last = run.results[run.results.length - 1]!;
    o.log(
      `  ${o.renderer} ${i + 1}/${o.fixtures.length} ${f.id}: ${last.status}${last.warmMs !== null ? ` ${last.warmMs.toFixed(3)} ms` : ''}`
    );
  }
  await runner.context.close();
  return run;
}
