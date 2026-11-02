/**
 * The explorer's file API (#58) at the HTTP seam: a listing plus GET/POST/PUT on one file,
 * `.mmd` only, inside the explorer root (v12's traversal guard), POST never overwrites.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { request, type IncomingHttpHeaders } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { explorerServerOptions, resolveExplorerRoot } from './explorer.ts';
import { REPO_ROOT } from './fixtures.ts';
import { startServer, type DevServer } from './server.ts';

const PORT = 9614;

interface Reply {
  status: number;
  type: string;
  body: string;
  headers: IncomingHttpHeaders;
}

/** What the explorer page sends on a write (`browser/explorer/api.ts`). */
const PAGE = { 'x-mermaid-dev': '1', origin: `http://127.0.0.1:${PORT}` };

function call(
  path: string,
  method = 'GET',
  body?: string,
  headers: Record<string, string> = method === 'GET' ? {} : PAGE
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: PORT, path, method, headers }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => (text += chunk));
      res.on('end', () =>
        resolve({
          status: res.statusCode ?? 0,
          type: String(res.headers['content-type'] ?? ''),
          body: text,
          headers: res.headers,
        })
      );
    });
    req.on('error', reject);
    req.end(body);
  });
}

const file = (path: string): string => `/dev/api/file?path=${encodeURIComponent(path)}`;

describe('the explorer file API', () => {
  let server: DevServer;
  let parent: string;
  let root: string;

  beforeAll(async () => {
    parent = mkdtempSync(join(tmpdir(), 'dev-explorer-'));
    root = join(parent, 'root');
    mkdirSync(join(root, 'flowchart', 'baseline'), { recursive: true });
    mkdirSync(join(root, 'sequence'));
    mkdirSync(join(root, 'Zeta'));
    writeFileSync(join(root, 'flowchart', 'baseline', 'b.mmd'), 'flowchart LR\n  B\n');
    writeFileSync(join(root, 'flowchart', 'baseline', 'a.mmd'), 'flowchart LR\n  A\n');
    writeFileSync(join(root, 'flowchart', 'baseline', 'notes.txt'), 'not a diagram');
    writeFileSync(join(root, 'top.mmd'), 'flowchart TD\n  T\n');
    writeFileSync(join(parent, 'outside.mmd'), 'flowchart TD\n  secret\n');
    server = await startServer(
      PORT,
      explorerServerOptions(root, { folders: () => ['flowchart', 'Zeta'] })
    );
  });
  afterAll(async () => {
    await server.close();
    rmSync(parent, { recursive: true, force: true });
  });

  describe('GET /dev/api/files', () => {
    it('lists the root: the given top-level folders, then .mmd files', async () => {
      const reply = await call('/dev/api/files');
      expect(reply.status).toBe(200);
      expect(JSON.parse(reply.body)).toEqual({
        root,
        path: '',
        entries: [
          { name: 'flowchart', kind: 'dir', path: 'flowchart' },
          { name: 'Zeta', kind: 'dir', path: 'Zeta' },
          { name: 'top.mmd', kind: 'file', path: 'top.mmd' },
        ],
      });
    });

    it('lists a subfolder: .mmd files only, sorted', async () => {
      const reply = await call('/dev/api/files?path=flowchart/baseline');
      expect(JSON.parse(reply.body)).toMatchObject({
        path: 'flowchart/baseline',
        entries: [
          { name: 'a.mmd', kind: 'file', path: 'flowchart/baseline/a.mmd' },
          { name: 'b.mmd', kind: 'file', path: 'flowchart/baseline/b.mmd' },
        ],
      });
    });

    it.each(['..', '../', 'flowchart/../..', '/..', 'a\0b'])('refuses %j', async (path) => {
      expect((await call(`/dev/api/files?path=${encodeURIComponent(path)}`)).status).toBe(400);
    });
  });

  describe('GET /dev/api/file', () => {
    it('reads a .mmd file as text', async () => {
      const reply = await call(file('flowchart/baseline/a.mmd'));
      expect(reply).toMatchObject({ status: 200, body: 'flowchart LR\n  A\n' });
      expect(reply.type).toContain('text/plain');
    });

    it.each([
      ['a non-.mmd file', 'flowchart/baseline/notes.txt'],
      ['a file above the root', '../outside.mmd'],
      ['a traversal through a folder', 'flowchart/../../outside.mmd'],
      ['backslash traversal', '..\\outside.mmd'],
      ['a missing file', 'flowchart/missing.mmd'],
      ['a directory', 'flowchart'],
    ])('refuses %s', async (_what, path) => {
      const reply = await call(file(path));
      expect(reply.status).toBe(400);
      expect(reply.body).not.toContain('secret');
    });

    it('treats a leading slash as root-relative', async () => {
      expect((await call(file('/top.mmd'))).body).toBe('flowchart TD\n  T\n');
    });
  });

  describe('POST /dev/api/file', () => {
    it('creates a new file with the given text, making folders', async () => {
      const reply = await call(file('new/one.mmd'), 'POST', 'flowchart LR\n  N\n');
      expect(reply.status).toBe(201);
      expect(JSON.parse(reply.body)).toEqual({ path: 'new/one.mmd', bytes: 17 });
      expect(readFileSync(join(root, 'new', 'one.mmd'), 'utf8')).toBe('flowchart LR\n  N\n');
    });

    it('creates a starter diagram when the body is empty', async () => {
      expect((await call(file('two.mmd'), 'POST', '')).status).toBe(201);
      expect(readFileSync(join(root, 'two.mmd'), 'utf8')).toMatch(/^flowchart TD\n/);
    });

    it('refuses to overwrite an existing file', async () => {
      const reply = await call(file('top.mmd'), 'POST', 'flowchart LR\n  X\n');
      expect(reply.status).toBe(409);
      expect(readFileSync(join(root, 'top.mmd'), 'utf8')).toBe('flowchart TD\n  T\n');
    });

    it.each([
      ['a non-.mmd path', 'evil.txt'],
      ['a path above the root', '../created.mmd'],
    ])('refuses %s', async (_what, path) => {
      expect((await call(file(path), 'POST', 'x')).status).toBe(400);
      expect(() => readFileSync(join(parent, 'created.mmd'))).toThrow();
    });
  });

  describe('PUT /dev/api/file', () => {
    it('overwrites an existing file', async () => {
      writeFileSync(join(root, 'put.mmd'), 'flowchart LR\n  old\n');
      const reply = await call(file('put.mmd'), 'PUT', 'flowchart LR\n  new\n');
      expect(reply.status).toBe(200);
      expect(JSON.parse(reply.body)).toEqual({ path: 'put.mmd', bytes: 19 });
      expect(readFileSync(join(root, 'put.mmd'), 'utf8')).toBe('flowchart LR\n  new\n');
    });

    it.each([
      ['a missing file', 'nope.mmd'],
      ['a non-.mmd file', 'flowchart/baseline/notes.txt'],
      ['a file above the root', '../outside.mmd'],
    ])('refuses %s', async (_what, path) => {
      expect((await call(file(path), 'PUT', 'overwritten')).status).toBe(400);
      expect(readFileSync(join(parent, 'outside.mmd'), 'utf8')).toBe('flowchart TD\n  secret\n');
    });
  });

  describe('write protection', () => {
    it.each(['POST', 'PUT'])('%s without the X-Mermaid-Dev header is a 403', async (method) => {
      writeFileSync(join(root, 'guarded.mmd'), 'flowchart LR\n  G\n');
      const path = method === 'POST' ? 'guarded-new.mmd' : 'guarded.mmd';
      const reply = await call(file(path), method, 'flowchart LR\n  X\n', {
        origin: `http://127.0.0.1:${PORT}`,
      });
      expect(reply.status).toBe(403);
      expect(readFileSync(join(root, 'guarded.mmd'), 'utf8')).toBe('flowchart LR\n  G\n');
      expect(() => readFileSync(join(root, 'guarded-new.mmd'))).toThrow();
    });

    it.each(['POST', 'PUT'])('%s from a foreign Origin is a 403', async (method) => {
      writeFileSync(join(root, 'guarded.mmd'), 'flowchart LR\n  G\n');
      const path = method === 'POST' ? 'guarded-new.mmd' : 'guarded.mmd';
      const reply = await call(file(path), method, 'flowchart LR\n  X\n', {
        'x-mermaid-dev': '1',
        origin: 'https://evil.example',
      });
      expect(reply.status).toBe(403);
      expect(readFileSync(join(root, 'guarded.mmd'), 'utf8')).toBe('flowchart LR\n  G\n');
    });

    it('a write from the page on another host (the tailnet) works', async () => {
      writeFileSync(join(root, 'remote.mmd'), 'flowchart LR\n  old\n');
      const reply = await call(file('remote.mmd'), 'PUT', 'flowchart LR\n  R\n', {
        'x-mermaid-dev': '1',
        host: `devbox.example.test:${PORT}`,
        origin: `http://devbox.example.test:${PORT}`,
      });
      expect(reply.status).toBe(200);
      expect(readFileSync(join(root, 'remote.mmd'), 'utf8')).toBe('flowchart LR\n  R\n');
    });

    it('grants no CORS preflight', async () => {
      const reply = await call(file('remote.mmd'), 'OPTIONS', undefined, {
        origin: 'https://evil.example',
        'access-control-request-method': 'PUT',
        'access-control-request-headers': 'x-mermaid-dev',
      });
      expect(reply.status).toBe(403);
      expect(reply.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('body size', () => {
    // 600 000 characters, 1 200 000 bytes: over the 1 MiB limit only when counted in bytes.
    const big = 'flowchart LR\n%% ' + 'é'.repeat(600_000);

    it('a PUT over 1 MiB (in bytes) is a 413 and changes nothing', async () => {
      writeFileSync(join(root, 'big.mmd'), 'flowchart LR\n  small\n');
      expect((await call(file('big.mmd'), 'PUT', big)).status).toBe(413);
      expect(readFileSync(join(root, 'big.mmd'), 'utf8')).toBe('flowchart LR\n  small\n');
    });

    it('a POST over 1 MiB is a 413 and creates nothing', async () => {
      expect((await call(file('big-new.mmd'), 'POST', big)).status).toBe(413);
      expect(() => readFileSync(join(root, 'big-new.mmd'))).toThrow();
    });

    it('/node-render over 1 MiB is a 413', async () => {
      const body = JSON.stringify({ code: big });
      expect((await call('/node-render', 'POST', body, {})).status).toBe(413);
    });
  });

  describe('names that start with two dots', () => {
    it('are inside the root, and can be created and read', async () => {
      expect((await call(file('..notes.mmd'), 'POST', 'flowchart LR\n  D\n')).status).toBe(201);
      expect(readFileSync(join(root, '..notes.mmd'), 'utf8')).toBe('flowchart LR\n  D\n');
      expect((await call(file('flowchart/..b.mmd'), 'POST', '')).status).toBe(201);
      expect((await call(file('..notes.mmd'))).body).toBe('flowchart LR\n  D\n');
    });
  });

  describe('the explorer page', () => {
    it('serves /dev/ and its script', async () => {
      expect(await call('/dev')).toMatchObject({ status: 302 });
      const page = await call('/dev/');
      expect(page.status).toBe(200);
      expect(page.body).toContain('<dev-explorer-app>');
      expect((await call('/build/explorer.js')).status).toBe(200);
    });

    it('vendors the Shoelace theme and icons, inside the package only', async () => {
      const css = await call('/dev/vendor/shoelace/themes/dark.css');
      expect(css).toMatchObject({ status: 200 });
      expect(css.type).toContain('text/css');
      expect((await call('/dev/vendor/shoelace/assets/icons/folder-fill.svg')).type).toContain(
        'image/svg+xml'
      );
      expect((await call('/dev/vendor/shoelace/%2e%2e/package.json')).status).toBe(404);
    });
  });
});

describe('resolveExplorerRoot', () => {
  it('defaults to the e2e fixture folders', () => {
    expect(resolveExplorerRoot({})).toBe(join(REPO_ROOT, 'e2e', 'diagrams'));
  });

  it('takes MERMAID_DEV_EXPLORER_ROOT, relative to the checkout', () => {
    expect(resolveExplorerRoot({ MERMAID_DEV_EXPLORER_ROOT: 'e2e/other' })).toBe(
      join(REPO_ROOT, 'e2e', 'other')
    );
    expect(resolveExplorerRoot({ MERMAID_DEV_EXPLORER_ROOT: '/tmp/x' })).toBe('/tmp/x');
  });
});
