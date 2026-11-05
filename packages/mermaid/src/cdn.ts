/**
 * The CDN build's ESM entry (D162, D163, D167; spec #218 T6), bundled to
 * `dist/mermaid.esm.min.mjs`: the `mermaid` API plus three things a page without a bundler
 * needs. `globalThis.mermaid` is set; the `globalThis.mermaidPlugins` queue is connected; and
 * `initialize({ cdnBase })` sets where first-party chunks (diagrams, their text entries, the
 * themes) load from. The default base is the directory this file was loaded from. Diagram text
 * can never set it (it is an integrator-only key), so no URL in a diagram ever leads to a load
 * (R-PLUG-7).
 */
import mermaid, { initialize as initializeSite, type InitializeConfig } from './index.ts';
import { connectPluginQueue } from './plugin-queue.ts';

export * from './index.ts';

/**
 * The global the build's rewritten lazy imports read (`cdn-build.ts`): the base URL, ending in
 * `/`. Chunks are module singletons, so the base is one per page, set by the last `initialize`.
 */
const CDN_BASE_KEY = Symbol.for('mermaid.cdnBase');

/** The default base: the directory this module (`mermaid.esm.min.mjs`) was loaded from. */
const DEFAULT_BASE = new URL('./', import.meta.url).href;

/** Sets the base to `value` resolved against the page, or back to the default. */
function setCdnBase(value: unknown): void {
  const g = globalThis as Record<symbol, unknown>;
  if (value === undefined) {
    g[CDN_BASE_KEY] = DEFAULT_BASE;
    return;
  }
  if (typeof value !== 'string' || value === '')
    throw new TypeError('cdnBase must be a URL string');
  const base = typeof document === 'undefined' ? undefined : document.baseURI;
  const url = new URL(value, base);
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  g[CDN_BASE_KEY] = url.href;
}

/** `initialize()`, also taking `cdnBase` (D163). Each call replaces the last, `cdnBase` too. */
export function initialize(config: InitializeConfig): void {
  setCdnBase(config.cdnBase);
  initializeSite(config);
}

setCdnBase(undefined);
mermaid.initialize = initialize;
(globalThis as { mermaid?: unknown }).mermaid = mermaid;
connectPluginQueue(mermaid);

export default mermaid;
