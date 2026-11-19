/**
 * Live reload at the HTTP seam: the mermaid bundle served at `/mermaid.esm.mjs` (split, with its
 * chunks, maps, gzip and cache headers) and the SSE broadcast at `/events` after a source change.
 * The change specs watch a temp directory and bundle a fixture module there, so no real source
 * file is ever modified.
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { request, type IncomingHttpHeaders } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer, type DevServer } from './server.ts';

const PORT = 9612;
const FIXTURE_PORT = 9613;

function get(path: string, port = PORT): Promise<{ status: number; type: string; body: string }> {
  return new Promise((resolve, reject) => {
    request({ host: '127.0.0.1', port, path }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => (body += chunk));
      res.on('end', () =>
        resolve({ status: res.statusCode ?? 0, type: res.headers['content-type'] ?? '', body })
      );
    })
      .on('error', reject)
      .end();
  });
}

interface Raw {
  status: number;
  headers: IncomingHttpHeaders;
  body: Buffer;
}

/** A GET with request headers, answering the raw (possibly compressed) body. */
function raw(path: string, headers: Record<string, string> = {}, port = PORT): Promise<Raw> {
  return new Promise((resolve, reject) => {
    request({ host: '127.0.0.1', port, path, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () =>
        resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) })
      );
    })
      .on('error', reject)
      .end();
  });
}

const RELATIVE_IMPORT = /["'](\.{1,2}\/[^"']+\.mjs)["']/g;

/**
 * Downloads `/mermaid.esm.mjs` and every chunk it reaches (static or dynamic import), each with
 * its map, into `dir` at their served paths. Answers each served path with its code.
 */
async function download(dir: string, port = PORT): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  const queue = ['/mermaid.esm.mjs'];
  for (let path = queue.pop(); path !== undefined; path = queue.pop()) {
    if (files.has(path)) continue;
    const res = await get(path, port);
    expect(res.status, path).toBe(200);
    files.set(path, res.body);
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), res.body);
    // The linked map beside it, so Node (vite) can resolve the comment that points at it.
    writeFileSync(join(dir, `${path}.map`), (await get(`${path}.map`, port)).body);
    for (const [, spec] of res.body.matchAll(RELATIVE_IMPORT)) {
      queue.push(new URL(spec!, `http://x${path}`).pathname);
    }
  }
  return files;
}

/** An open `/events` stream; `next()` resolves with the data of the next event. */
interface Events {
  next(timeoutMs?: number): Promise<string>;
  close(): void;
}

function events(port: number): Promise<Events> {
  return new Promise((resolve, reject) => {
    const waiting: ((data: string) => void)[] = [];
    const queued: string[] = [];
    let buffer = '';
    const req = request({ host: '127.0.0.1', port, path: '/events' }, (res) => {
      expect(res.headers['content-type']).toBe('text/event-stream');
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => {
        buffer += chunk;
        let end;
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const data = block
            .split('\n')
            .filter((line) => line.startsWith('data: '))
            .map((line) => line.slice(6))
            .join('\n');
          if (!data) continue; // a comment, such as the connect greeting
          const waiter = waiting.shift();
          if (waiter) waiter(data);
          else queued.push(data);
        }
      });
      resolve({
        next: (timeoutMs = 15_000) =>
          new Promise((done, fail) => {
            const data = queued.shift();
            if (data !== undefined) return done(data);
            const timer = setTimeout(() => fail(new Error('no SSE event')), timeoutMs);
            waiting.push((d) => {
              clearTimeout(timer);
              done(d);
            });
          }),
        close: () => res.destroy(),
      });
    });
    req.on('error', reject);
    req.end();
  });
}

describe('the dev bundle', () => {
  let server: DevServer;
  beforeAll(async () => {
    server = await startServer(PORT);
  }, 60_000);
  afterAll(async () => {
    await server.close();
  });

  it('serves mermaid with plugin-interactions as ESM, split into chunks', async () => {
    const res = await get('/mermaid.esm.mjs');
    expect(res.status).toBe(200);
    expect(res.type).toContain('javascript');
    expect(res.body).toMatch(/export\s*\{[^}]*\bcreateMermaid\b/);
    expect(res.body).toMatch(/export\s*\{[^}]*\binteractions\b/);
    expect(res.body).toContain('./chunks/mermaid.esm/');
  });

  it('keeps elkjs out of the entry: it is a chunk, loaded when an ELK layout is used', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dev-chunks-'));
    try {
      const files = await download(dir);
      const withElk = [...files].filter(([, body]) => body.includes('org.eclipse.elk'));
      expect(withElk.length).toBeGreaterThan(0);
      expect(withElk.map(([path]) => path)).not.toContain('/mermaid.esm.mjs');
      expect(withElk.every(([path]) => path.startsWith('/chunks/mermaid.esm/'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it('links its source map instead of inlining it', async () => {
    const res = await get('/mermaid.esm.mjs');
    expect(res.body).not.toContain('sourceMappingURL=data:');
    expect(res.body.trimEnd()).toMatch(/\/\/# sourceMappingURL=mermaid\.esm\.mjs\.map$/);
    const map = await get('/mermaid.esm.mjs.map');
    expect(map.status).toBe(200);
    expect(map.type).toContain('json');
    expect((JSON.parse(map.body) as { sources: string[] }).sources.length).toBeGreaterThan(0);
  });

  it('sends gzip to a client that takes it, and the same bytes uncompressed otherwise', async () => {
    const plain = await raw('/mermaid.esm.mjs');
    const zipped = await raw('/mermaid.esm.mjs', { 'accept-encoding': 'gzip, br' });
    expect(plain.headers['content-encoding']).toBeUndefined();
    expect(zipped.headers['content-encoding']).toBe('gzip');
    expect(zipped.headers.vary).toBe('accept-encoding');
    expect(gunzipSync(zipped.body).equals(plain.body)).toBe(true);
    expect(zipped.body.length).toBeLessThan(plain.body.length / 2);
  });

  it('gzips what it relays from the page build, too', async () => {
    const zipped = await raw('/dev/reload.js', { 'accept-encoding': 'gzip' });
    expect(zipped.status).toBe(200);
    expect(zipped.headers['content-encoding']).toBe('gzip');
    expect(gunzipSync(zipped.body).toString()).toContain('/events');
  });

  it('revalidates the entry by ETag, answering 304 for the version the client holds', async () => {
    const first = await raw('/mermaid.esm.mjs');
    expect(first.headers['cache-control']).toBe('no-cache');
    const etag = first.headers.etag;
    expect(etag).toMatch(/^".+"$/);
    const again = await raw('/mermaid.esm.mjs', { 'if-none-match': etag! });
    expect(again.status).toBe(304);
    expect(again.body.length).toBe(0);
  });

  it('caches a content-hashed chunk as immutable, and answers 404 for an unknown one', async () => {
    const entry = await get('/mermaid.esm.mjs');
    const [, spec] = /["'](\.\/chunks\/mermaid\.esm\/[^"']+\.mjs)["']/.exec(entry.body)!;
    const chunk = await raw(spec!.slice(1));
    expect(chunk.status).toBe(200);
    expect(chunk.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect((await raw('/chunks/mermaid.esm/nope.mjs')).status).toBe(404);
  });

  it('has stage timing on: a render records parse, layout and serialise', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dev-timing-'));
    try {
      await download(dir);
      const file = join(dir, 'mermaid.esm.mjs');
      const bundle = (await import(pathToFileURL(file).href)) as {
        STAGE_TIMING: boolean;
        installStageClock(clock: { now(): number; record(stage: string, ms: number): void }): void;
        createMermaid(): { render(id: string, text: string): Promise<{ svg: string }> };
      };
      expect(bundle.STAGE_TIMING).toBe(true);
      const stages: string[] = [];
      let tick = 0;
      bundle.installStageClock({ now: () => ++tick, record: (stage) => stages.push(stage) });
      await bundle.createMermaid().render('timing', 'flowchart LR\n  A --> B\n');
      expect([...new Set(stages)].sort()).toEqual(['layout', 'parse', 'serialise']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    // Not a time limit on what it checks: it downloads and imports the whole dev bundle
    // (megabytes of JavaScript) and renders once, which takes more than vitest's default 5 s on a busy
    // runner. The same limit as the server start above.
  }, 60_000);

  it('serves the reload client at /dev/reload.js', async () => {
    const res = await get('/dev/reload.js');
    expect(res.status).toBe(200);
    expect(res.type).toContain('javascript');
    expect(res.body).toContain('/events');
  });
});

describe('live reload', () => {
  let server: DevServer;
  let dir: string;
  let entry: string;
  beforeAll(async () => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), 'mermaid-dev-watch-')));
    entry = join(dir, 'entry.js');
    writeFileSync(entry, "export const probe = 'before';\n");
    server = await startServer(FIXTURE_PORT, {
      watch: { paths: [dir] },
      bundleEntry: entry,
    });
  }, 60_000);
  afterAll(async () => {
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('sends an SSE event after a touched watched file is rebuilt', async () => {
    const stream = await events(FIXTURE_PORT);
    try {
      const now = new Date();
      utimesSync(entry, now, now);
      const data = JSON.parse(await stream.next()) as { time: number; paths: string[] };
      expect(data.paths).toContain(entry.split('\\').join('/'));
      expect(typeof data.time).toBe('number');
    } finally {
      stream.close();
    }
  });

  it('serves a source change in /mermaid.esm.mjs once the event arrives', async () => {
    const stream = await events(FIXTURE_PORT);
    try {
      expect((await get('/mermaid.esm.mjs', FIXTURE_PORT)).body).toContain('before');
      writeFileSync(entry, "export const probe = 'after';\n");
      await stream.next();
      const body = (await get('/mermaid.esm.mjs', FIXTURE_PORT)).body;
      expect(body).toContain('after');
      expect(body).not.toContain('before');
    } finally {
      stream.close();
    }
  });
});
