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
import { extractBase } from './base.ts';
import { benchDefine, bundle, sizeOf, summarise } from './build.ts';
import type { Bundle } from './build.ts';
import type { Fixture } from './fixtures.ts';
import { compareIdentity } from './identity.ts';
import type { IdentityOutcome, IdentityPair, IdentityResult } from './identity.ts';
import type { Session } from './interleave.ts';
import { runAll } from './interleave.ts';
import { stripMermaidOnlyConfig } from './normalize.ts';
import { flowchartClosureSize } from './size-budget.ts';
import { emptyStages, STAGES } from './report.ts';
import type {
  DiagramResult,
  PageHistory,
  RendererId,
  RendererRun,
  SizeSummary,
  SizedFile,
} from './report.ts';
import type { BenchWindow, ReadyInfo, RenderReply } from './runner/protocol.ts';
import { median, quantile } from './stats.ts';

const PKG = fileURLToPath(new URL('../', import.meta.url));
export const SITE_DIR = join(PKG, 'dist', 'site');

export interface Site {
  v13: Bundle;
  stages: Bundle;
  /** The v13 bundle of the base commit, when `v13-base` was asked for and could be built. */
  base?: Bundle & { version: string };
  /** Why `v13-base` could not be built (unknown ref, or the commit fails to bundle). */
  baseError?: string;
  /** URL path prefix → directory on disk. */
  roots: Record<string, string>;
}

function moduleDir(alias: string): string {
  return realpathSync(join(PKG, 'node_modules', alias));
}

const MODULE: Partial<Record<RendererId, string>> = {
  'v12-frozen': 'mermaid-v12-frozen',
  'v12-current': 'mermaid-v12',
  pele: 'pele',
};

/** Version of an npm or working-tree renderer (`v13-base` carries its own, from the build). */
export function versionOf(id: Exclude<RendererId, 'v13-base'>): string {
  const alias = MODULE[id];
  const dir = alias === undefined ? join(PKG, '..', 'mermaid') : moduleDir(alias);
  return (JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { version: string })
    .version;
}

/**
 * The file a renderer is imported from in Node, or undefined when it only runs in a browser
 * (Mermaid 12 needs a DOM). v13 and Pele are DOM-free; v13's bundles are the browser ones.
 */
export function nodeEntry(site: Site, id: RendererId): string | undefined {
  const of = (b: Bundle | undefined) => (b === undefined ? undefined : join(b.outdir, b.entryFile));
  if (id === 'v13') return of(site.v13);
  if (id === 'v13-stages') return of(site.stages);
  if (id === 'v13-base') return of(site.base);
  if (id === 'pele') return join(moduleDir('pele'), 'dist', 'pele.js');
  return undefined;
}

/** The run of a `v13-base` that could not be built: every fixture missing, with the reason. */
export function unbuiltBase(site: Site, fixtures: Fixture[]): RendererRun {
  const error = site.baseError ?? 'v13-base was not built';
  return {
    renderer: 'v13-base',
    version: 'unknown',
    status: 'missing',
    error,
    readyAtMs: null,
    initMs: null,
    size: null,
    results: fixtures.map((f) => result(f, 'missing', error)),
  };
}

export interface SiteOptions {
  /** Build `v13-base` from this ref (a branch, tag or sha); omitted, it is not built. */
  baseRef?: string;
}

/** Builds the base commit's production bundle; a failure is reported, not thrown. */
async function buildBase(ref: string): Promise<Pick<Site, 'base' | 'baseError'>> {
  try {
    const tree = extractBase(ref);
    const built = await bundle({
      entry: tree.entry,
      outdir: join(SITE_DIR, 'v13-base'),
      bench: false,
    });
    return { base: { ...built, version: tree.version } };
  } catch (e) {
    return { baseError: e instanceof Error ? e.message.split('\n')[0]! : String(e) };
  }
}

/** Builds the runner script and the v13 bundles (working tree, and base if asked) into `dist/site`. */
export async function buildSite(options: SiteOptions = {}): Promise<Site> {
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
  const base = options.baseRef === undefined ? {} : await buildBase(options.baseRef);
  return {
    v13,
    stages,
    ...base,
    roots: {
      '/harness/': join(SITE_DIR, 'harness'),
      '/r/v13/': join(SITE_DIR, 'v13'),
      '/r/v13-stages/': join(SITE_DIR, 'v13-stages'),
      ...(base.base && { '/r/v13-base/': join(SITE_DIR, 'v13-base') }),
      '/r/v12-frozen/': join(moduleDir('mermaid-v12-frozen'), 'dist'),
      '/r/v12-current/': join(moduleDir('mermaid-v12'), 'dist'),
      '/r/pele/': join(moduleDir('pele'), 'dist'),
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
  log: (line: string) => void;
}

interface BenchPage {
  page: Page;
  context: BrowserContext;
  ready: ReadyInfo;
}

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

export function result(f: Fixture, status: DiagramResult['status'], error?: string): DiagramResult {
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

export function fromReply(f: Fixture, reply: RenderReply): DiagramResult {
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
    ...(reply.renderSamples && {
      renderMs: median(reply.renderSamples),
      browserMs: median(reply.browserSamples ?? []),
    }),
  };
}

/** Renders one fixture on an open page, with a timeout; a page that timed out is replaced. */
async function measureOn(
  o: DriveOptions,
  holder: { runner: BenchPage },
  f: Fixture
): Promise<DiagramResult> {
  const source = o.strip ? stripMermaidOnlyConfig(f.source).source : f.source;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'timeout'>(
    (resolve) => (timer = setTimeout(() => resolve('timeout'), o.timeoutMs))
  );
  const reply = await Promise.race([
    holder.runner.page
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
  if (reply !== 'timeout') return fromReply(f, reply);
  // The page is still busy with this diagram; start a fresh one for the rest.
  await holder.runner.context.close();
  holder.runner = await openRunner(o);
  return result(f, 'timeout', `no result within ${o.timeoutMs} ms`);
}

/**
 * Opens one renderer's page. Returns a session that measures fixtures one at a time, or a
 * finished run (every fixture missing or failed) when the renderer could not start.
 */
export async function openBrowserSession(o: DriveOptions): Promise<Session | RendererRun> {
  if (o.renderer === 'v13-base' && !o.site.base) {
    const run = unbuiltBase(o.site, o.fixtures);
    o.log(`  v13-base: not built: ${run.error}`);
    return run;
  }
  const version = o.renderer === 'v13-base' ? o.site.base!.version : versionOf(o.renderer);
  const holder = { runner: await openRunner(o) };
  const base: Omit<RendererRun, 'status' | 'results'> = {
    renderer: o.renderer,
    version,
    readyAtMs: null,
    initMs: null,
    size: null,
  };
  // R-PERF-1 (D160): the same set the runner fetches for one flowchart render.
  const v13Static = (): SizeSummary | null =>
    o.renderer === 'v13' ? flowchartClosureSize(o.site.v13) : null;

  const ready = holder.runner.ready;
  if (!ready.ok) {
    await holder.runner.context.close();
    o.log(`  ${o.renderer}: ${ready.missing ? 'pipeline missing' : 'init failed'}: ${ready.error}`);
    return {
      ...base,
      status: ready.missing ? 'missing' : 'init-error',
      error: ready.error,
      size: v13Static(),
      results: o.fixtures.map((f) => result(f, ready.missing ? 'missing' : 'error', ready.error)),
    };
  }

  const prefix = `/r/${o.renderer}/`;
  const loaded = ready.resources
    .map((r) => new URL(r.name).pathname)
    .filter((p) => p.startsWith(prefix))
    .map((p) => o.server.size(p))
    .filter((s): s is SizedFile => s !== undefined);
  return {
    renderer: o.renderer,
    run: {
      ...base,
      status: 'ready',
      readyAtMs: ready.readyAt,
      initMs: ready.initMs,
      size: loaded.length > 0 ? summarise(loaded, 'loaded') : v13Static(),
      results: [],
    },
    measure: (f) => measureOn(o, holder, f),
    close: () => holder.runner.context.close(),
  };
}

export type BrowserDriveOptions = Omit<DriveOptions, 'renderer'> & {
  renderers: RendererId[];
  /** Filled with the page-history line when v13 and Pele both run (#265). */
  pageHistory?: PageHistory[];
};

/** The fixtures timed again in a fresh page and after the corpus (#265's finish rule). */
export const PAGE_HISTORY_IDS = ['perf/huge1', 'perf/medium4', 'perf/medium5'] as const;
const PAGE_HISTORY_RENDERERS = ['v13', 'pele'] as const;

/**
 * Times each page-history fixture on v13 and Pele again: on the pages that rendered the corpus,
 * and in a fresh page each, opened for that one fixture.
 */
async function pageHistory(
  o: BrowserDriveOptions,
  sessions: Session[],
  out: PageHistory[]
): Promise<void> {
  const open = PAGE_HISTORY_RENDERERS.map((r) => sessions.find((s) => s.renderer === r));
  if (open.includes(undefined)) return;
  for (const id of PAGE_HISTORY_IDS) {
    const f = o.fixtures.find((x) => x.id === id);
    if (!f) continue;
    const entry: PageHistory = { id, fresh: {}, after: {} };
    for (const s of open as Session[]) {
      const r = await s.measure(f);
      entry.after[s.renderer] = r.status === 'ok' ? r.warmMs : null;
      const fresh = await openBrowserSession({ ...o, renderer: s.renderer });
      if (!('measure' in fresh)) continue;
      try {
        const rf = await fresh.measure(f);
        entry.fresh[s.renderer] = rf.status === 'ok' ? rf.warmMs : null;
      } finally {
        await fresh.close();
      }
    }
    o.log(
      `  page history ${id}: after ${JSON.stringify(entry.after)}, fresh ${JSON.stringify(entry.fresh)}`
    );
    out.push(entry);
  }
}

/** Runs every fixture through every renderer in the browser, alternating (`interleave.ts`). */
export function driveBrowser(o: BrowserDriveOptions): Promise<RendererRun[]> {
  const out = o.pageHistory;
  return runAll(
    o.renderers,
    (renderer) => openBrowserSession({ ...o, renderer }),
    o.fixtures,
    o.log,
    'browser',
    out ? (sessions) => pageHistory(o, sessions, out) : undefined
  );
}

export type IdentityDriveOptions = Omit<DriveOptions, 'renderer'>;

/** Renders one fixture once on an open page, with a timeout; a page that timed out is replaced. */
async function renderSvgOn(
  o: DriveOptions,
  holder: { runner: BenchPage },
  source: string,
  id: string
): Promise<IdentityOutcome> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'timeout'>(
    (resolve) => (timer = setTimeout(() => resolve('timeout'), o.timeoutMs))
  );
  const reply = await Promise.race([
    holder.runner.page
      .evaluate(
        ([s, i]) => (window as unknown as { __bench: BenchWindow }).__bench.renderSvg(s, i),
        [source, id] as const
      )
      .catch(
        (e: unknown): IdentityOutcome => ({ error: e instanceof Error ? e.message : String(e) })
      ),
    timeout,
  ]);
  clearTimeout(timer);
  if (reply !== 'timeout') return reply;
  await holder.runner.context.close();
  holder.runner = await openRunner(o);
  return { timeout: o.timeoutMs };
}

/**
 * The identity gate (D200): renders every fixture once through `v13` and `v13-base`, each in its
 * own page, alternating, with the same id and the same source, and compares the SVG strings.
 * Throws when either renderer cannot start, since then nothing can be compared.
 */
export async function driveIdentity(o: IdentityDriveOptions): Promise<IdentityResult> {
  if (!o.site.base) throw new Error(`v13-base not built: ${o.site.baseError ?? 'no base ref'}`);
  const open = async (renderer: 'v13' | 'v13-base') => {
    const d = { ...o, renderer };
    const holder = { runner: await openRunner(d) };
    const ready = holder.runner.ready;
    if (!ready.ok) {
      await holder.runner.context.close();
      throw new Error(`${renderer} did not start: ${ready.error}`);
    }
    return { d, holder };
  };
  const head = await open('v13');
  try {
    const base = await open('v13-base');
    try {
      const pairs: IdentityPair[] = [];
      for (const [i, f] of o.fixtures.entries()) {
        const source = o.strip ? stripMermaidOnlyConfig(f.source).source : f.source;
        const id = `identity${i}`;
        pairs.push({
          id: f.id,
          head: await renderSvgOn(head.d, head.holder, source, id),
          base: await renderSvgOn(base.d, base.holder, source, id),
        });
      }
      return compareIdentity(pairs);
    } finally {
      await base.holder.runner.context.close();
    }
  } finally {
    await head.holder.runner.context.close();
  }
}
