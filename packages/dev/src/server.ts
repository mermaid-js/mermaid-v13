// cspell:words servedir
/**
 * The dev server (`pnpm dev`) and the Playwright page server: a node:http front over esbuild's
 * serve. Requests go through a route table in order (first match wins); anything no route
 * takes falls through to esbuild, which bundles the `entries` from source on request and
 * serves `www/` statically.
 *
 * Extend it by passing `routes` (and `entries` for another page script) to `startServer`, or
 * by adding to `builtInRoutes` in `routes.ts`.
 */
import { createServer, request, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';
import { context } from 'esbuild';
import { listenUrls } from './listen.ts';
import { builtInRoutes, type Route } from './routes.ts';

export type { Route } from './routes.ts';

const WWW = join(import.meta.dirname, '..', 'www');

export interface ServerOptions {
  /** Extra routes, tried after the built-in ones. */
  readonly routes?: readonly Route[];
  /** Extra esbuild entry points (output name → source file), served as `/build/<name>.js`. */
  readonly entries?: Readonly<Record<string, string>>;
  /** The interface to bind. Default: all interfaces. */
  readonly host?: string;
}

export interface DevServer {
  /** `http://localhost:<port>`, for local clients. */
  readonly url: string;
  readonly port: number;
  /** The bound socket address (`::` or `0.0.0.0` when listening on all interfaces). */
  readonly address: AddressInfo;
  /** Every URL it answers on, one per interface address, read at startup. */
  readonly urls: readonly string[];
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

export async function startServer(port: number, options: ServerOptions = {}): Promise<DevServer> {
  const ctx = await context({
    entryPoints: {
      viewer: join(import.meta.dirname, 'browser', 'viewer.ts'),
      ...options.entries,
    },
    outdir: join(WWW, 'build'),
    // Served from memory; nothing is written to disk.
    write: false,
    bundle: true,
    format: 'esm',
    splitting: true,
    target: 'es2022',
    conditions: ['mermaid-source'],
    sourcemap: 'inline',
    logLevel: 'warning',
  });
  const esb = await ctx.serve({ servedir: WWW, host: '127.0.0.1' });
  const routes = [...builtInRoutes, ...(options.routes ?? [])];

  const proxy = (req: IncomingMessage, res: ServerResponse): void => {
    const proxied = request(
      {
        host: '127.0.0.1',
        port: esb.port,
        path: req.url,
        method: req.method,
        // esbuild's serve rejects any Host but its own, so a browser on another machine
        // (another hostname or the IP) would get 403. Name esbuild's own address instead.
        headers: { ...req.headers, host: `127.0.0.1:${esb.port}` },
      },
      (upstream) => {
        res.writeHead(upstream.statusCode ?? 502, upstream.headers);
        upstream.pipe(res);
      }
    );
    proxied.on('error', () => {
      res.writeHead(502);
      res.end();
    });
    req.pipe(proxied);
  };

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
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
    async close() {
      const closed = new Promise<void>((done) => server.close(() => done()));
      server.closeAllConnections();
      await closed;
      await ctx.dispose();
    },
  };
}
