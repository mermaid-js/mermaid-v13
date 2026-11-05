/**
 * `dist/mermaid.min.js` (D162): the classic-script loader of the CDN build. It sets
 * `globalThis.mermaid` at once, so v12's `<script src=".../mermaid.min.js">` followed by
 * `mermaid.initialize(…)` keeps working, and `import()`s `mermaid.esm.min.mjs` from its own
 * directory (or, for a bare package URL such as `https://unpkg.com/mermaid@13`, from its
 * `dist/`). Until that resolves, `globalThis.mermaid` is a stand-in with every method of the
 * API: calls are recorded and replayed on the module strictly in call order (an async one
 * returns a promise of the real result); the synchronous ones that return a value
 * (`renderSync`, `detectType`, `supportsFormat`, `mount`) throw. Properties set on the
 * stand-in (v12's `mermaid.parseError = …`) are copied onto the module. A replayed call that
 * throws is logged and the rest still run; with `startOnLoad`, the page's diagrams render once
 * both the page and the module have loaded. No imports: this file is the whole loader.
 */
type Method = (...args: unknown[]) => unknown;
type Api = Record<string, unknown>;

const ESM_FILE = 'mermaid.esm.min.mjs';
/** Every method of the `mermaid` API object, the async and void ones first. */
const DEFERRED = [
  'render',
  'prepare',
  'preload',
  'parse',
  'run',
  'registerExternalDiagrams',
  'initialize',
  'registerLayoutLoaders',
  'registerIconPacks',
  'setParseErrorHandler',
  'contentLoaded',
];
const SYNC = ['renderSync', 'detectType', 'supportsFormat', 'mount'];

interface Call {
  readonly name: string;
  readonly args: unknown[];
  readonly done?: { resolve(v: unknown): void; reject(e: unknown): void };
}

/** Where the ESM file is: beside this file, or in `dist/` under a bare package URL. */
function esmUrl(src: string): string {
  const url = new URL(src);
  if (!/\.[cm]?js$/.test(url.pathname)) url.pathname = url.pathname.replace(/\/?$/, '/dist/');
  return new URL(ESM_FILE, url).href;
}

const script = document.currentScript as HTMLScriptElement | null;
if (!script?.src) throw new Error('mermaid.min.js must be loaded by a <script src> tag');

const ASYNC = new Set(DEFERRED.slice(0, 6));
let real: Api | undefined;
const calls: Call[] = [];
const stub: Api = {};
const invoke = (name: string, args: unknown[]): unknown => (real![name] as Method)(...args);

function replay(): void {
  for (const own of Object.keys(stub))
    if (!(DEFERRED.includes(own) || SYNC.includes(own))) real![own] = stub[own];
  for (const { name, args, done } of calls.splice(0)) {
    try {
      const result = invoke(name, args);
      done?.resolve(result);
    } catch (e) {
      if (done) done.reject(e);
      else console.error(`mermaid: mermaid.${name}() failed`, e);
    }
  }
  // The load event already passed: index.ts's `startOnLoad` listener will never fire.
  if (document.readyState === 'complete') {
    try {
      invoke('contentLoaded', []);
    } catch (e) {
      console.error('mermaid: rendering the page diagrams failed', e);
    }
  }
}

import(esmUrl(script.src)).then(
  (m: { default: Api }) => {
    real = m.default;
    replay();
  },
  (e: unknown) => {
    console.error(`mermaid: ${ESM_FILE} failed to load`, e);
    for (const { done } of calls.splice(0)) done?.reject(e);
  }
);

for (const name of DEFERRED)
  stub[name] = (...args: unknown[]) => {
    if (real) return invoke(name, args);
    if (!ASYNC.has(name)) return void calls.push({ name, args });
    return new Promise((resolve, reject) => calls.push({ name, args, done: { resolve, reject } }));
  };
for (const name of SYNC)
  stub[name] = (...args: unknown[]) => {
    if (real) return invoke(name, args);
    throw new Error(
      `mermaid.${name}() needs the module loaded: await mermaid.render() or run() first`
    );
  };

(globalThis as { mermaid?: unknown }).mermaid = stub;
