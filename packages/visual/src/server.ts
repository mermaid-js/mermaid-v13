// cspell:words servedir
/**
 * The e2e page server (replaces v12's `pnpm dev`): esbuild bundles `src/browser/viewer.ts` on
 * request and serves `www/`; this front server adds
 *
 * - `POST /node-render` `{ code, options }` → the same adapter's output rendered in Node, for
 *   the Node-vs-browser equality spec;
 * - `GET /fonts/<file>` → the `@fontsource/noto-sans-sc` files, for the late-font spec;
 * - `GET /smoke.mjs` → the smoke bundle (`smoke:build`), for the browser and worker smoke renders.
 */
import { createReadStream, existsSync } from 'node:fs';
import { createServer, request, type IncomingMessage, type Server } from 'node:http';
import { createRequire } from 'node:module';
import { basename, dirname, join } from 'node:path';
import { context } from 'esbuild';
import { renderDiagram, type RenderOptions } from './adapter.ts';

const WWW = join(import.meta.dirname, '..', 'www');
const SMOKE = join(import.meta.dirname, '..', 'dist', 'smoke', 'smoke.mjs');
const FONTS = join(
  dirname(createRequire(import.meta.url).resolve('@fontsource/noto-sans-sc/package.json')),
  'files'
);

export interface PageServer {
  readonly url: string;
  close(): Promise<void>;
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

export async function startServer(port: number): Promise<PageServer> {
  const ctx = await context({
    entryPoints: { viewer: join(import.meta.dirname, 'browser', 'viewer.ts') },
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

  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<a href="/e2e.html">e2e.html</a>');
      return;
    }
    if (url.pathname === '/node-render' && req.method === 'POST') {
      readBody(req)
        .then(async (body) => {
          const { code, options } = JSON.parse(body) as { code: string; options?: RenderOptions };
          const out = await renderDiagram(code, options);
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify(out));
        })
        .catch((error: unknown) => {
          res.writeHead(500, { 'content-type': 'text/plain' });
          res.end(error instanceof Error ? error.message : String(error));
        });
      return;
    }
    if (url.pathname === '/smoke.mjs') {
      if (!existsSync(SMOKE)) {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end(
          'no smoke bundle: run `pnpm build && pnpm --filter @mermaid-js/visual smoke:build`'
        );
        return;
      }
      res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' });
      createReadStream(SMOKE).pipe(res);
      return;
    }
    if (url.pathname.startsWith('/fonts/')) {
      const file = join(FONTS, basename(url.pathname));
      if (!existsSync(file)) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, {
        'content-type': file.endsWith('.woff2') ? 'font/woff2' : 'font/woff',
        'cache-control': 'no-store',
      });
      createReadStream(file).pipe(res);
      return;
    }
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
  });
  await new Promise<void>((done) => server.listen(port, done));
  return {
    url: `http://localhost:${port}`,
    async close() {
      await new Promise<void>((done) => server.close(() => done()));
      await ctx.dispose();
    },
  };
}
