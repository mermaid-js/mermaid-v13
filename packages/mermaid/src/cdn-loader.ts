/**
 * `dist/mermaid.min.js` (D162): the classic-script loader of the CDN build. It sets
 * `globalThis.mermaid` at once, so v12's `<script src=".../mermaid.min.js">` followed by
 * `mermaid.initialize(…)` keeps working, and `import()`s `mermaid.esm.min.mjs` from its own
 * directory. Until that resolves, `globalThis.mermaid` is a stand-in: the async methods wait
 * for the module, the void ones are replayed on it in call order, and the synchronous ones
 * that return a value throw. With `startOnLoad`, the page's diagrams render once both the
 * page and the module have loaded. No imports: this file is the whole loader.
 */
type Method = (...args: unknown[]) => unknown;
type Api = Record<string, Method>;

const ESM_FILE = 'mermaid.esm.min.mjs';
const ASYNC = ['render', 'prepare', 'preload', 'parse', 'run', 'registerExternalDiagrams'];
const REPLAYED = [
  'initialize',
  'registerLayoutLoaders',
  'registerIconPacks',
  'setParseErrorHandler',
  'contentLoaded',
];
const SYNC = ['renderSync', 'detectType', 'supportsFormat', 'mount'];

const script = document.currentScript as HTMLScriptElement | null;
if (!script?.src) throw new Error('mermaid.min.js must be loaded by a <script src> tag');

let real: Api | undefined;
const calls: [string, unknown[]][] = [];
const loading: Promise<Api> = import(new URL(ESM_FILE, script.src).href).then(
  (m: { default: Api }) => {
    real = m.default;
    for (const [name, args] of calls.splice(0)) real[name]!(...args);
    // The load event already passed: index.ts's `startOnLoad` listener will never fire.
    if (document.readyState === 'complete') real.contentLoaded!();
    return real;
  }
);
loading.catch((e: unknown) => console.error('mermaid: the ESM build failed to load', e));

const stub: Api = {};
for (const name of ASYNC)
  stub[name] = (...args) => (real ? real[name]!(...args) : loading.then((m) => m[name]!(...args)));
for (const name of REPLAYED)
  stub[name] = (...args) => (real ? real[name]!(...args) : void calls.push([name, args]));
for (const name of SYNC)
  stub[name] = (...args) => {
    if (real) return real[name]!(...args);
    throw new Error(
      `mermaid.${name}() needs the module loaded: await mermaid.render() or run() first`
    );
  };

(globalThis as { mermaid?: unknown }).mermaid = stub;
