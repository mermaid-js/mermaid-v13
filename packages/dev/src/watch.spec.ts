/**
 * Live reload at the HTTP seam: the mermaid bundle served at `/mermaid.esm.mjs` and the SSE
 * broadcast at `/events` after a source change. The change specs watch a temp directory and
 * bundle a fixture module there, so no real source file is ever modified.
 */
import { mkdtempSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
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

  it('serves mermaid with plugin-interactions as one ESM bundle', async () => {
    const res = await get('/mermaid.esm.mjs');
    expect(res.status).toBe(200);
    expect(res.type).toContain('javascript');
    expect(res.body).toMatch(/export\s*\{[^}]*\bcreateMermaid\b/);
    expect(res.body).toMatch(/export\s*\{[^}]*\binteractions\b/);
    // One file: no chunk imports.
    expect(res.body).not.toMatch(/from\s*["']\.\/chunk-/);
  });

  it('has stage timing on: a flowchart records parse, measure, layout and serialise', async () => {
    const res = await get('/mermaid.esm.mjs');
    const dir = mkdtempSync(join(tmpdir(), 'dev-timing-'));
    try {
      const file = join(dir, 'mermaid.esm.mjs');
      writeFileSync(file, res.body);
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
      expect([...new Set(stages)].sort()).toEqual(['layout', 'measure', 'parse', 'serialise']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

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
