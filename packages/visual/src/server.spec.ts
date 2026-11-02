import { request } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer, type PageServer } from './server.ts';

const PORT = 9611;

/** GET a path with a chosen Host header, as a browser on another machine sends it. */
function get(path: string, host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: PORT, path, headers: { host } }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on('error', reject);
    req.end();
  });
}

describe('startServer', () => {
  let server: PageServer;
  beforeAll(async () => {
    server = await startServer(PORT);
  });
  afterAll(async () => {
    await server.close();
  });

  it('serves pages to a client that reaches it under another hostname', async () => {
    expect(await get('/e2e.html', `devbox.example.test:${PORT}`)).toBe(200);
  });

  it('serves pages to a client that uses the machine IP', async () => {
    expect(await get('/e2e.html', `192.0.2.10:${PORT}`)).toBe(200);
  });
});
