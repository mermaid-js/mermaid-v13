/**
 * Live reload at the HTTP seam: the mermaid bundle served at `/mermaid.esm.mjs` and the SSE
 * broadcast at `/events` after a source change in a workspace package.
 */
import { readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { request, type IncomingMessage } from 'node:http';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { REPO_ROOT } from './fixtures.ts';
import { startServer, type DevServer } from './server.ts';

const PORT = 9612;
// A module the mermaid bundle includes. The specs only touch it or append a legal comment
// (kept by esbuild at the end of the bundle), and restore it afterwards.
const SOURCE = join(REPO_ROOT, 'packages', 'core', 'src', 'index.ts');

function get(path: string): Promise<{ status: number; type: string; body: string }> {
  return new Promise((resolve, reject) => {
    request({ host: '127.0.0.1', port: PORT, path }, (res) => {
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

function events(): Promise<Events> {
  return new Promise((resolve, reject) => {
    const waiting: ((data: string) => void)[] = [];
    const queued: string[] = [];
    let buffer = '';
    const req = request({ host: '127.0.0.1', port: PORT, path: '/events' }, (res) => {
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
        close: () => (res as IncomingMessage).destroy(),
      });
    });
    req.on('error', reject);
    req.end();
  });
}

describe('live reload', () => {
  let server: DevServer;
  const original = readFileSync(SOURCE, 'utf8');
  beforeAll(async () => {
    server = await startServer(PORT, { watch: true });
  }, 60_000);
  afterAll(async () => {
    writeFileSync(SOURCE, original);
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

  it('serves the reload client at /dev/reload.js', async () => {
    const res = await get('/dev/reload.js');
    expect(res.status).toBe(200);
    expect(res.type).toContain('javascript');
    expect(res.body).toContain('/events');
  });

  it('sends an SSE event after a touched packages/core/src file is rebuilt', async () => {
    const stream = await events();
    try {
      const now = new Date();
      utimesSync(SOURCE, now, now);
      const data = JSON.parse(await stream.next()) as { time: number; paths: string[] };
      expect(data.paths).toContain('packages/core/src/index.ts');
      expect(typeof data.time).toBe('number');
    } finally {
      stream.close();
    }
  });

  it('serves a source change in /mermaid.esm.mjs once the event arrives', async () => {
    const probe = `dev-watch-probe-${Date.now()}`;
    const stream = await events();
    try {
      expect((await get('/mermaid.esm.mjs')).body).not.toContain(probe);
      writeFileSync(SOURCE, `${original}\n/*! ${probe} */\n`);
      await stream.next();
      expect((await get('/mermaid.esm.mjs')).body).toContain(probe);
      writeFileSync(SOURCE, original);
      await stream.next();
      expect((await get('/mermaid.esm.mjs')).body).not.toContain(probe);
    } finally {
      stream.close();
    }
  });
});
