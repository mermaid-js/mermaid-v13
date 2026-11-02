/**
 * The Compare tab's versions proxy (#61) at the HTTP seam: `GET /dev/api/versions` answers
 * npm's `mermaid` versions and dist-tags, fetches the registry at most once per TTL, and
 * answers from its cache (marked `stale`) when the registry can't be reached.
 */
import { createServer, request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { startServer, type DevServer } from './server.ts';
import { VERSIONS_TTL_MS, versionsRoute, type VersionsResponse } from './versions.ts';

const PORT = 9621;

function get(path: string, port = PORT): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => (text += chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: text }));
    });
    req.on('error', reject);
    req.end();
  });
}

/** npm's abbreviated document for `mermaid`, cut down. */
const DOCUMENT = {
  name: 'mermaid',
  'dist-tags': { latest: '12.1.0', next: '13.0.0-rc.1' },
  versions: Object.fromEntries(
    ['11.9.0', '12.0.0', '13.0.0-rc.1', '12.1.0', '11.10.0'].map((v) => [v, { version: v }])
  ),
};

describe('GET /dev/api/versions', () => {
  let registry: Server;
  let registryUrl: string;
  let hits: string[];
  let server: DevServer;
  let clock: number;

  const startRegistry = async (): Promise<void> => {
    registry = createServer((req, res) => {
      hits.push(req.url ?? '');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(DOCUMENT));
    });
    await new Promise<void>((done) => registry.listen(0, '127.0.0.1', done));
    registryUrl = `http://127.0.0.1:${(registry.address() as AddressInfo).port}`;
  };
  const stopRegistry = (): Promise<void> =>
    new Promise((done) => {
      registry.closeAllConnections();
      registry.close(() => done());
    });

  beforeAll(async () => {
    hits = [];
    clock = 1_000_000;
    await startRegistry();
    server = await startServer(PORT, {
      routes: [versionsRoute({ registry: registryUrl, now: () => clock })],
    });
  });

  afterEach(() => {
    hits = [];
  });

  afterAll(async () => {
    await server.close();
    if (registry.listening) await stopRegistry();
  });

  it('answers the versions newest first and the dist-tags', async () => {
    const reply = await get('/dev/api/versions');
    expect(reply.status).toBe(200);
    const body = JSON.parse(reply.body) as VersionsResponse;
    expect(body.mermaid.versions).toEqual(['13.0.0-rc.1', '12.1.0', '12.0.0', '11.10.0', '11.9.0']);
    expect(body.mermaid.distTags).toEqual({ latest: '12.1.0', next: '13.0.0-rc.1' });
    expect(body.stale).toBe(false);
    expect(hits).toEqual(['/mermaid']);
  });

  it('answers from the cache within the TTL', async () => {
    clock += VERSIONS_TTL_MS - 1;
    const reply = await get('/dev/api/versions');
    expect(reply.status).toBe(200);
    expect(hits).toEqual([]);
  });

  it('fetches again once the TTL has passed', async () => {
    clock += 2;
    await get('/dev/api/versions');
    expect(hits).toEqual(['/mermaid']);
  });

  it('answers from the cache, marked stale, when the registry is offline', async () => {
    await stopRegistry();
    clock += VERSIONS_TTL_MS + 1;
    const reply = await get('/dev/api/versions');
    expect(reply.status).toBe(200);
    const body = JSON.parse(reply.body) as VersionsResponse;
    expect(body.stale).toBe(true);
    expect(body.mermaid.distTags.latest).toBe('12.1.0');
  });
});

describe('GET /dev/api/versions with no cache and no registry', () => {
  it('answers 502 with the error', async () => {
    const server = await startServer(PORT + 1, {
      routes: [versionsRoute({ registry: 'http://127.0.0.1:1' })],
    });
    try {
      const reply = await get('/dev/api/versions', PORT + 1);
      expect(reply.status).toBe(502);
      expect((JSON.parse(reply.body) as { error: string }).error).toMatch(/registry/);
    } finally {
      await server.close();
    }
  });
});
