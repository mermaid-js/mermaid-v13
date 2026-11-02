/**
 * The built-in routes of the dev server:
 *
 * - `GET /` → links to the Dev Explorer and the e2e page;
 * - `POST /node-render` `{ code, options }` → the same adapter's output rendered in Node, for
 *   the Node-vs-browser equality spec;
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

export async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
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
      const { code, options } = JSON.parse(await readBody(req)) as {
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
