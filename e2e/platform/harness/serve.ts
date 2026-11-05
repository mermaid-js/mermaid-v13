/**
 * A static file server for a built app: one directory on a free port of 127.0.0.1. Two
 * servers are two origins (the CDN page loads from a second one).
 */
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize, resolve, sep } from 'node:path';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
};

export interface ServeOptions {
  /** Headers on every response, e.g. `{ 'access-control-allow-origin': '*' }`. */
  readonly headers?: Readonly<Record<string, string>>;
  /** Port to listen on; default a free one. */
  readonly port?: number;
}

export interface StaticServer {
  /** e.g. `http://127.0.0.1:54321`. */
  readonly origin: string;
  /** `origin` + `path`. */
  url(path?: string): string;
  /** Every request path served or refused, in order (`GET /assets/main.js 200`). */
  readonly requests: readonly string[];
  close(): Promise<void>;
}

/** Serves `dir`; a directory answers with its `index.html`. */
export async function serveDir(dir: string, opts: ServeOptions = {}): Promise<StaticServer> {
  const root = resolve(dir);
  const requests: string[] = [];
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    const send = (status: number, body: Buffer | string, type = 'text/plain; charset=utf-8') => {
      requests.push(`${req.method} ${path} ${status}`);
      res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', ...opts.headers });
      res.end(req.method === 'HEAD' ? undefined : body);
    };
    const file = normalize(join(root, path));
    if (file !== root && !file.startsWith(root + sep)) return send(403, 'forbidden');
    void (async () => {
      try {
        const target = (await stat(file)).isDirectory() ? join(file, 'index.html') : file;
        const body = await readFile(target);
        send(200, body, TYPES[extname(target)] ?? 'application/octet-stream');
      } catch {
        send(404, 'not found');
      }
    })();
  });
  await new Promise<void>((done, fail) => {
    server.once('error', fail);
    server.listen(opts.port ?? 0, '127.0.0.1', done);
  });
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    origin,
    url: (path = '/') => new URL(path, origin).href,
    requests,
    close: () =>
      new Promise<void>((done) => {
        server.closeAllConnections();
        server.close(() => done());
      }),
  };
}
