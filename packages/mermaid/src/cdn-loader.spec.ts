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

/**
 * A fake ESM build for load `id`: every API method records its call in that load's own list
 * (a loader left over from an earlier test can never write into a later test's list);
 * `initialize` throws on `'bad'`. Evaluating it marks the load as imported.
 */
const fake = (id: number): string => `
const methods = ${JSON.stringify(Object.keys(createMermaid()))};
const calls = globalThis.__calls[${id}];
const api = {};
for (const name of methods)
  api[name] = (...args) => {
    calls.push([name, ...args]);
    if (name === 'initialize' && args[0] === 'bad') throw new Error('bad config');
    return name === 'render' ? Promise.resolve('svg:' + args[0]) : undefined;
  };
globalThis.mermaid = api;
globalThis.__imported[${id}] = true;
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
  __calls?: Record<number, unknown[][]>;
  __imported?: Record<number, boolean>;
};

interface Loaded {
  readonly stub: Stub;
  /** The calls the fake module received, in order. */
  readonly calls: unknown[][];
  /** Resolves once the fake module is imported and the loader's replay has run. */
  settled(): Promise<void>;
}

let loads = 0;
let current: Loaded | undefined;

/**
 * Writes the fake under `dist/`, loads the loader with `currentScript.src` = `src(dir)` and a
 * `data-cdn-base` attribute of `cdnBase(dir)` (none when it returns undefined).
 */
async function load(
  src: (dir: string) => string,
  readyState = 'loading',
  cdnBase: (dir: string) => string | undefined = () => undefined
): Promise<Loaded> {
  const id = ++loads;
  const dir = mkdtempSync(join(tmpdir(), 'mermaid-loader-'));
  mkdirSync(join(dir, 'dist'));
  writeFileSync(join(dir, 'dist', 'mermaid.esm.min.mjs'), fake(id));
  const calls: unknown[][] = [];
  (g.__calls ??= {})[id] = calls;
  g.__imported ??= {};
  const url = pathToFileURL(dir).href;
  const attr = cdnBase(url);
  g.document = {
    baseURI: `${url}/page/index.html`,
    currentScript: {
      src: src(url),
      getAttribute: (name: string) => (name === 'data-cdn-base' ? (attr ?? null) : null),
    },
    readyState,
  };
  vi.resetModules();
  await import('./cdn-loader.ts');
  const stub = g.mermaid!;
  current = {
    stub,
    calls,
    // After the module evaluates, one task boundary lets the loader's replay (a promise
    // callback) finish.
    settled: async () => {
      await vi.waitUntil(() => g.__imported![id] === true, { timeout: 30_000, interval: 5 });
      await new Promise((r) => setTimeout(r, 0));
    },
  };
  return current;
}

// Each test's loader finishes before the next one starts, so none reads a later document.
afterEach(async () => {
  await current?.settled();
  current = undefined;
  delete g.document;
  delete g.mermaid;
});

describe('mermaid.min.js', () => {
  it('stubs every method of the API at once', async () => {
    const { stub } = await load((d) => `${d}/dist/mermaid.min.js`);
    const api: Record<string, unknown> = createMermaid();
    const methods = Object.keys(api).filter((name) => typeof api[name] === 'function');
    expect(methods).toContain('render');
    for (const name of methods) expect(typeof stub[name], name).toBe('function');
    // v12's `parseError` is a property: set on the stand-in, it is copied, not replayed.
    expect(stub.parseError).toBeUndefined();
    expect(() => stub.detectType('flowchart')).toThrow(/needs the module loaded/);
  });

  it('replays calls made before load strictly in call order, async ones included', async () => {
    const { stub, calls } = await load((d) => `${d}/dist/mermaid.min.js`);
    stub.initialize({ startOnLoad: false });
    const svg = stub.render('one');
    stub.registerLayoutLoaders('later');
    expect(await svg).toBe('svg:one');
    expect(calls).toEqual([
      ['initialize', { startOnLoad: false }],
      ['render', 'one'],
      ['registerLayoutLoaders', 'later'],
    ]);
  });

  it('keeps replaying after a call throws, and still renders the page when it loaded', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const loaded = await load((d) => `${d}/dist/mermaid.min.js`, 'complete');
      loaded.stub.initialize('bad');
      loaded.stub.registerLayoutLoaders('after');
      await loaded.settled();
      expect(loaded.calls.map(([n]) => n)).toEqual([
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
    const { stub } = await load((d) => `${d}/dist/mermaid.min.js`);
    const handler = (): void => undefined;
    stub.parseError = handler;
    await stub.render('x');
    expect(g.mermaid!.parseError).toBe(handler);
    expect(g.mermaid).not.toBe(stub);
  });

  it('defers v12 init() as an async call and copies startOnLoad = false (#764, D643)', async () => {
    const { stub, calls, settled } = await load((d) => `${d}/dist/mermaid.min.js`);
    expect(stub.startOnLoad).toBe(true);
    expect(() => (stub.getRegisteredDiagramsMetadata as () => unknown)()).toThrow(/module loaded/);
    stub.startOnLoad = false;
    const done = (stub.init as (c: unknown) => Promise<unknown>)({ theme: 'dark' });
    expect(done).toBeInstanceOf(Promise);
    await done;
    await settled();
    expect(calls).toEqual([['init', { theme: 'dark' }]]);
    expect(g.mermaid!.startOnLoad).toBe(false);
  });

  it('finds the ESM file under dist/ for a bare package URL (unpkg, jsDelivr)', async () => {
    const { stub } = await load((d) => `${d}?v=13`);
    expect(await stub.render('bare')).toBe('svg:bare');
  });

  it('loads the whole build from data-cdn-base, normalised like cdnBase', async () => {
    // The loader's own directory has no ESM file: only the attribute's base can load it.
    const { stub } = await load(
      (d) => `${d}/elsewhere/mermaid.min.js`,
      'loading',
      () => '../dist?v=1#top'
    );
    expect(await stub.render('mirror')).toBe('svg:mirror');
  });
});
