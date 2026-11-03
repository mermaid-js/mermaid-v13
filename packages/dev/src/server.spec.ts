import { request } from 'node:http';
import { networkInterfaces } from 'node:os';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listenUrls } from './listen.ts';
import { startServer, type DevServer, type Route } from './server.ts';

const PORT = 9611;

interface Reply {
  status: number;
  body: string;
}

/** A request with a chosen Host header, as a browser on another machine sends it. */
function call(
  path: string,
  { host = `127.0.0.1:${PORT}`, address = '127.0.0.1', method = 'GET' } = {}
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = request({ host: address, port: PORT, path, method, headers: { host } }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

const extra: Route = {
  path: '/extra/',
  prefix: true,
  method: 'GET',
  handle: (_req, res, url) => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end(`extra ${url.pathname}`);
  },
};

const failing: Route = {
  path: '/fails',
  handle: () => Promise.reject(new Error('boom')),
};

describe('startServer', () => {
  let server: DevServer;
  beforeAll(async () => {
    server = await startServer(PORT, { routes: [extra, failing] });
  });
  afterAll(async () => {
    await server.close();
  });

  it('serves pages to a client that reaches it under another hostname', async () => {
    expect((await call('/e2e.html', { host: `devbox.example.test:${PORT}` })).status).toBe(200);
  });

  it('serves pages to a client that uses the machine IP', async () => {
    expect((await call('/e2e.html', { host: `192.0.2.10:${PORT}` })).status).toBe(200);
  });

  it('listens on all interfaces and reports every interface address', () => {
    // The wildcard: `::` (dual stack), or `0.0.0.0` on a host without IPv6.
    expect(['::', '0.0.0.0']).toContain(server.address.address);
    expect(server.urls).toEqual(listenUrls(server.address, networkInterfaces()));
    const v4 = Object.values(networkInterfaces())
      .flat()
      .filter((nic) => nic?.family === 'IPv4')
      .map((nic) => `http://${nic.address}:${PORT}/`);
    expect(server.urls).toEqual(expect.arrayContaining(v4));
    expect(server.urls).toContain(`http://127.0.0.1:${PORT}/`);
  });

  it('answers on every IPv4 interface address', async () => {
    const v4 = Object.values(networkInterfaces())
      .flat()
      .filter((nic) => nic?.family === 'IPv4')
      .map((nic) => nic.address);
    for (const address of v4) {
      expect((await call('/e2e.html', { address, host: `${address}:${PORT}` })).status).toBe(200);
    }
  });

  it('dispatches extra routes by prefix and method', async () => {
    expect(await call('/extra/a/b')).toEqual({ status: 200, body: 'extra /extra/a/b' });
    // Another method falls through to the static server, which has no such file.
    expect((await call('/extra/a/b', { method: 'DELETE' })).status).not.toBe(200);
  });

  it('turns a route that throws into a 500', async () => {
    expect(await call('/fails')).toEqual({ status: 500, body: 'boom' });
  });
});
