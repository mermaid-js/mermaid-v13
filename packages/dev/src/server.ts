// cspell:words servedir
/**
 * The dev server (`pnpm dev`) and the Playwright page server: a node:http front over esbuild's
 * serve. Requests go through a route table in order (first match wins); anything no route
 * takes falls through to esbuild, which bundles the `entries` from source on request and
 * serves `www/` statically.
 *
 * It also builds mermaid (with plugin-interactions) from source as ESM at `/mermaid.esm.mjs`,
 * split as production splits it: what loads lazily there (diagram types, ELK) is a chunk under
 * `/chunks/mermaid.esm/` here, fetched on first use. With `watch`, a change under any
 * `packages/<name>/src` (or `www/`) rebuilds both contexts and broadcasts on `GET /events`;
 * `/dev/reload.js` reloads a page then.
 *
 * Source maps are linked, not inline. Text goes out gzip-compressed to a browser that asks, and
 * content-hashed chunks are cached as immutable (`transfer.ts`, #958).
 *
 * Extend it by passing `routes` (and `entries` for another page script) to `startServer`, or
 * by adding to `builtInRoutes` in `routes.ts`.
 */
import { createServer, request, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { networkInterfaces } from 'node:os';
import { join, relative, sep } from 'node:path';
import { context, type BuildOptions } from 'esbuild';
import { REPO_ROOT } from './fixtures.ts';
import { listenUrls } from './listen.ts';
import { createEventHub, watchSources, type ReloadEvent, type SourceWatcher } from './live.ts';
import { builtInRoutes, type Route } from './routes.ts';
import {
  IMMUTABLE,
  relay,
  REVALIDATE,
  sendServed,
  servedFile,
  type ServedFile,
} from './transfer.ts';

export type { ReloadEvent } from './live.ts';

export type { Route } from './routes.ts';

const WWW = join(import.meta.dirname, '..', 'www');
const BROWSER = join(import.meta.dirname, 'browser');

export interface WatchOptions {
  /** Extra files or directories to watch (e.g. the explorer's `.mmd` root). */
  readonly paths?: readonly string[];
  /** Default 100 ms, as v12. */
  readonly debounceMs?: number;
}

export interface ServerOptions {
  /** Extra routes, tried after the built-in ones. */
  readonly routes?: readonly Route[];
  /** Extra esbuild entry points (output name → source file), served as `/build/<name>.js`. */
  readonly entries?: Readonly<Record<string, string>>;
  /** The interface to bind. Default: all interfaces. */
  readonly host?: string;
  /**
   * Watch the workspace sources and rebuild on change. Default off (the specs that don't
   * need it); both CLIs turn it on.
   */
  readonly watch?: boolean | WatchOptions;
  /**
   * The rebuild hook: runs on every rebuild, alongside the built-in contexts and before the
   * `/events` broadcast, with the changed paths (repo-relative, posix). A throw is reported
   * and the broadcast still goes out.
   */
  readonly onRebuild?: (paths: readonly string[]) => void | Promise<void>;
  /**
   * The entry bundled as `/mermaid.esm.mjs`. Default: `browser/mermaid.ts` (mermaid plus
   * plugin-interactions). The specs point it at a fixture module in a temp directory.
   */
  readonly bundleEntry?: string;
  /**
   * GET pathnames any origin may read (`access-control-allow-origin: *`): exact, or every
   * pathname below one that ends in `/`. For pages in a sandboxed iframe (an opaque origin),
   * such as the Compare panes. Default: none.
   */
  readonly cors?: readonly string[];
}

export interface DevServer {
  /** `http://localhost:<port>`, for local clients. */
  readonly url: string;
  readonly port: number;
  /** The bound socket address (`::` or `0.0.0.0` when listening on all interfaces). */
  readonly address: AddressInfo;
  /** Every URL it answers on, one per interface address, read at startup. */
  readonly urls: readonly string[];
  /**
   * Rebuild everything, run `onRebuild`, then broadcast `paths` on `/events`: what the watcher
   * does after a change. Rebuilds run one at a time.
   */
  rebuild(paths?: readonly string[]): Promise<void>;
  close(): Promise<void>;
}

export const matches = (route: Route, method: string, pathname: string): boolean =>
  (route.method === undefined || route.method === method) &&
  (route.prefix ? pathname.startsWith(route.path) : pathname === route.path);

function fail(res: ServerResponse, error: unknown): void {
  if (res.headersSent) {
    res.destroy();
    return;
  }
  res.writeHead(500, { 'content-type': 'text/plain' });
  res.end(error instanceof Error ? error.message : String(error));
}

const report = (what: string, error: unknown): void => {
  process.stderr.write(
    `[dev] ${what}: ${error instanceof Error ? error.message : String(error)}\n`
  );
};

const shared: BuildOptions = {
  // Served from memory; nothing is written to disk.
  write: false,
  bundle: true,
  format: 'esm',
  target: 'es2022',
  conditions: ['mermaid-source'],
  // Linked: a browser fetches a map only when its devtools are open.
  sourcemap: 'linked',
  logLevel: 'warning',
};

export async function startServer(port: number, options: ServerOptions = {}): Promise<DevServer> {
  const ctx = await context({
    ...shared,
    entryPoints: {
      viewer: join(BROWSER, 'viewer.ts'),
      reload: join(BROWSER, 'reload.ts'),
      ...options.entries,
    },
    outdir: join(WWW, 'build'),
    splitting: true,
    // Under one folder, so their content-hashed names can be cached as immutable.
    chunkNames: 'chunks/[name]-[hash]',
  });
  const esb = await ctx.serve({ servedir: WWW, host: '127.0.0.1' });

  // mermaid + plugin-interactions, split like production: the entry, and its chunks under
  // `chunks/mermaid.esm/`. Stage timing (`@mermaid-js/core/timing`) is on in this bundle only,
  // for the Profile tab; the production bundles never define the flag, so theirs stays off.
  // Split or not, the bundle holds one copy of core.
  const mermaidCtx = await context({
    ...shared,
    entryPoints: { 'mermaid.esm': options.bundleEntry ?? join(BROWSER, 'mermaid.ts') },
    outdir: WWW,
    splitting: true,
    chunkNames: 'chunks/mermaid.esm/[name]-[hash]',
    outExtension: { '.js': '.mjs' },
    define: { __MERMAID_BENCH__: 'true' },
  });
  // Served by pathname. The previous build's files stay, so a page that loaded that build can
  // still fetch the chunks it has not used yet; its entry is replaced.
  let bundle: { files: Map<string, ServedFile>; error?: string } = { files: new Map() };
  let lastBuild = new Map<string, ServedFile>();
  const buildMermaid = async (): Promise<void> => {
    try {
      const result = await mermaidCtx.rebuild();
      const files = new Map<string, ServedFile>();
      for (const out of result.outputFiles ?? []) {
        const pathname = '/' + relative(WWW, out.path).split(sep).join('/');
        const type = pathname.endsWith('.map') ? 'application/json' : 'text/javascript';
        const cache = pathname.startsWith('/chunks/') && !pathname.endsWith('.map');
        files.set(pathname, servedFile(type, out.contents, cache ? IMMUTABLE : REVALIDATE));
      }
      bundle = { files: new Map([...lastBuild, ...files]) };
      lastBuild = files;
    } catch (error) {
      bundle = { ...bundle, error: error instanceof Error ? error.message : String(error) };
      report('mermaid build failed', error);
    }
  };
  await buildMermaid();
  const serveBundle: Route['handle'] = async (req, res, url) => {
    const file = bundle.files.get(url.pathname);
    if (file && !(url.pathname === '/mermaid.esm.mjs' && bundle.error)) {
      await sendServed(req, res, file);
      return;
    }
    const failed = url.pathname === '/mermaid.esm.mjs';
    res.writeHead(failed ? 500 : 404, { 'content-type': 'text/plain' });
    res.end(failed ? (bundle.error ?? 'mermaid bundle not built') : 'not found');
  };

  const hub = createEventHub();
  const own: Route[] = [
    hub.route,
    // The entry and its map (`/mermaid.esm.mjs.map`), and its chunks.
    { path: '/mermaid.esm.mjs', prefix: true, method: 'GET', handle: serveBundle },
    { path: '/chunks/mermaid.esm/', prefix: true, method: 'GET', handle: serveBundle },
    {
      path: '/dev/reload.js',
      method: 'GET',
      handle: (req, res) => proxy(req, res, '/build/reload.js'),
    },
  ];
  const routes = [...builtInRoutes, ...own, ...(options.routes ?? [])];

  let queue = Promise.resolve();
  const rebuild = (paths: readonly string[] = []): Promise<void> =>
    (queue = queue.then(async () => {
      await Promise.all([
        ctx.rebuild().catch((error: unknown) => report('page build failed', error)),
        buildMermaid(),
        Promise.resolve()
          .then(() => options.onRebuild?.(paths))
          .catch((error: unknown) => report('onRebuild failed', error)),
      ]);
      const event: ReloadEvent = { time: Date.now(), paths };
      hub.broadcast(event);
    }));

  const watchOptions = options.watch === true ? {} : options.watch;
  const watcher: SourceWatcher | undefined = watchOptions
    ? await watchSources(
        REPO_ROOT,
        watchOptions.paths ?? [],
        watchOptions.debounceMs ?? 100,
        (paths) => void rebuild(paths)
      )
    : undefined;

  function proxy(req: IncomingMessage, res: ServerResponse, path = req.url): void {
    const proxied = request(
      {
        host: '127.0.0.1',
        port: esb.port,
        path,
        method: req.method,
        // esbuild's serve rejects any Host but its own, so a browser on another machine
        // (another hostname or the IP) would get 403. Name esbuild's own address instead.
        headers: { ...req.headers, host: `127.0.0.1:${esb.port}` },
      },
      (upstream) =>
        relay(req, upstream, res, path?.startsWith('/build/chunks/') ? IMMUTABLE : undefined)
    );
    proxied.on('error', () => {
      res.writeHead(502);
      res.end();
    });
    req.pipe(proxied);
  }

  const cors = options.cors ?? [];
  const corsAllowed = (pathname: string): boolean =>
    cors.some((p) => (p.endsWith('/') ? pathname.startsWith(p) : pathname === p));

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (req.method === 'GET' && corsAllowed(url.pathname)) {
      res.setHeader('access-control-allow-origin', '*');
    }
    const route = routes.find((r) => matches(r, req.method ?? 'GET', url.pathname));
    if (!route) {
      proxy(req, res);
      return;
    }
    try {
      void Promise.resolve(route.handle(req, res, url)).catch((error: unknown) => fail(res, error));
    } catch (error) {
      fail(res, error);
    }
  });
  await new Promise<void>((done, reject) => {
    server.once('error', reject);
    server.listen(port, options.host, done);
  });
  const address = server.address() as AddressInfo;
  return {
    url: `http://localhost:${address.port}`,
    port: address.port,
    address,
    urls: listenUrls(address, networkInterfaces()),
    rebuild,
    async close() {
      await watcher?.close();
      const closed = new Promise<void>((done) => server.close(() => done()));
      server.closeAllConnections();
      await closed;
      await queue;
      await Promise.all([ctx.dispose(), mermaidCtx.dispose()]);
    },
  };
}
