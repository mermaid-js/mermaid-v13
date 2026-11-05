/**
 * The classic loader `mermaid.min.js` (D162; spec #218 T6), run in Node against a stand-in
 * `document` and a fake `mermaid.esm.min.mjs` written to a temporary directory.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMermaid } from './index.ts';

/** A fake ESM build: every API method records its call; `initialize` throws on `'bad'`. */
const FAKE = `
const methods = ${JSON.stringify(Object.keys(createMermaid()))};
const api = {};
for (const name of methods)
  api[name] = (...args) => {
    globalThis.__calls.push([name, ...args]);
    if (name === 'initialize' && args[0] === 'bad') throw new Error('bad config');
    return name === 'render' ? Promise.resolve('svg:' + args[0]) : undefined;
  };
globalThis.mermaid = api;
export default api;
`;

interface Stub extends Record<string, unknown> {
  render(id: string): Promise<string>;
  initialize(c: unknown): void;
  registerLayoutLoaders(l: unknown): void;
  detectType(t: string): string;
}
const g = globalThis as {
  document?: unknown;
  mermaid?: Stub;
  __calls?: unknown[][];
};

/** Writes the fake under `dist/`, loads the loader with `currentScript.src` = `src(dir)`. */
async function load(src: (dir: string) => string, readyState = 'loading'): Promise<Stub> {
  const dir = mkdtempSync(join(tmpdir(), 'mermaid-loader-'));
  mkdirSync(join(dir, 'dist'));
  writeFileSync(join(dir, 'dist', 'mermaid.esm.min.mjs'), FAKE);
  g.__calls = [];
  g.document = { currentScript: { src: src(pathToFileURL(dir).href) }, readyState };
  vi.resetModules();
  await import('./cdn-loader.ts');
  return g.mermaid!;
}

afterEach(() => {
  delete g.document;
  delete g.mermaid;
  delete g.__calls;
});

describe('mermaid.min.js', () => {
  it('stubs every method of the API at once', async () => {
    const stub = await load((d) => `${d}/dist/mermaid.min.js`);
    for (const name of Object.keys(createMermaid()))
      expect(typeof stub[name], name).toBe('function');
    expect(() => stub.detectType('flowchart')).toThrow(/needs the module loaded/);
  });

  it('replays calls made before load strictly in call order, async ones included', async () => {
    const stub = await load((d) => `${d}/dist/mermaid.min.js`);
    stub.initialize({ startOnLoad: false });
    const svg = stub.render('one');
    stub.registerLayoutLoaders('later');
    expect(await svg).toBe('svg:one');
    expect(g.__calls).toEqual([
      ['initialize', { startOnLoad: false }],
      ['render', 'one'],
      ['registerLayoutLoaders', 'later'],
    ]);
  });

  it('keeps replaying after a call throws, and still renders the page when it loaded', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const stub = await load((d) => `${d}/dist/mermaid.min.js`, 'complete');
      stub.initialize('bad');
      stub.registerLayoutLoaders('after');
      await vi.waitUntil(() => g.__calls!.some(([n]) => n === 'contentLoaded'));
      expect(g.__calls!.map(([n]) => n)).toEqual([
        'initialize',
        'registerLayoutLoaders',
        'contentLoaded',
      ]);
      expect(error).toHaveBeenCalledWith('mermaid: mermaid.initialize() failed', expect.any(Error));
    } finally {
      error.mockRestore();
    }
  });

  it('copies properties set on the stand-in onto the module (v12 parseError)', async () => {
    const stub = await load((d) => `${d}/dist/mermaid.min.js`);
    const handler = (): void => undefined;
    stub.parseError = handler;
    await stub.render('x');
    expect(g.mermaid!.parseError).toBe(handler);
    expect(g.mermaid).not.toBe(stub);
  });

  it('finds the ESM file under dist/ for a bare package URL (unpkg, jsDelivr)', async () => {
    const stub = await load((d) => `${d}?v=13`);
    expect(await stub.render('bare')).toBe('svg:bare');
  });
});
