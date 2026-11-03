/**
 * The built-in routes of the dev server:
 *
 * - `GET /` → links to the Dev Explorer and the e2e page;
 * - `POST /node-render` `{ code, options }` → the same adapter's output rendered in Node, for
 *   the Node-vs-browser equality spec (bodies over `MAX_BODY_BYTES` are a 413);
 * - `GET /fonts/<file>` → the `@fontsource/noto-sans-sc` files, for the late-font spec;
 * - `GET /smoke.mjs` → the smoke bundle (`smoke:build`), for the browser and worker smoke renders.
 */
import { createReadStream, existsSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import { basename, dirname, join } from 'node:path';
import { renderDiagram, type RenderOptions } from './adapter.ts';

const SMOKE = join(import.meta.dirname, '..', 'dist', 'smoke', 'smoke.mjs');
const FONTS = join(
  dirname(createRequire(import.meta.url).resolve('@fontsource/noto-sans-sc/package.json')),
  'files'
);

export interface Route {
  /** The pathname to match: exact, or, with `prefix`, every pathname starting with it. */
  readonly path: string;
  readonly prefix?: boolean;
  /** Only this method matches. Default: any. */
  readonly method?: string;
  /**
   * Answers the request. A thrown error or rejection becomes a 500 with its message if no
   * headers were sent. Long-lived responses (SSE) are fine: `close()` ends them.
   */
  handle(req: IncomingMessage, res: ServerResponse, url: URL): void | Promise<void>;
}

/** The largest request body any route accepts, in bytes. */
export const MAX_BODY_BYTES = 1024 * 1024;

/**
 * The request body as UTF-8, read as it streams in. Past `limit` bytes it stops keeping it,
 * answers 413 (closing the connection) and resolves `undefined`: the caller just returns.
 */
export function readBody(
  req: IncomingMessage,
  res: ServerResponse,
  limit = MAX_BODY_BYTES
): Promise<string | undefined> {
  return new Promise((done, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const onData = (chunk: Buffer): void => {
      size += chunk.length;
      if (size <= limit) {
        chunks.push(chunk);
        return;
      }
      req.off('data', onData);
      req.off('end', onEnd);
      // The rest is discarded unread, so the client can finish sending and read the 413.
      req.resume();
      res.writeHead(413, { 'content-type': 'application/json', connection: 'close' });
      res.end(JSON.stringify({ error: 'Body too large' }));
      done(undefined);
    };
    const onEnd = (): void => done(Buffer.concat(chunks).toString('utf8'));
    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', reject);
  });
}

/** Streams `file` with `type`, or answers 404 when it does not exist. */
export function sendFile(res: ServerResponse, file: string, type: string, missing = ''): void {
  if (!existsSync(file)) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end(missing);
    return;
  }
  res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
  createReadStream(file).pipe(res);
}

export const builtInRoutes: readonly Route[] = [
  {
    path: '/',
    method: 'GET',
    handle: (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<a href="/dev/">Dev Explorer</a> · <a href="/e2e.html">e2e.html</a>');
    },
  },
  {
    path: '/node-render',
    method: 'POST',
    handle: async (req, res) => {
      const body = await readBody(req, res);
      if (body === undefined) return;
      const { code, options } = JSON.parse(body) as {
        code: string;
        options?: RenderOptions;
      };
      const out = await renderDiagram(code, options);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(out));
    },
  },
  {
    path: '/smoke.mjs',
    method: 'GET',
    handle: (_req, res) =>
      sendFile(
        res,
        SMOKE,
        'text/javascript',
        'no smoke bundle: run `pnpm build && pnpm --filter @mermaid-js/dev smoke:build`'
      ),
  },
  {
    path: '/fonts/',
    prefix: true,
    method: 'GET',
    handle: (_req, res, url) => {
      const file = join(FONTS, basename(url.pathname));
      sendFile(res, file, file.endsWith('.woff2') ? 'font/woff2' : 'font/woff');
    },
  },
];
