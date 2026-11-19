/**
 * Public mermaid API (DESIGN §3): render, prepare, renderSync, preload, parse, initialize,
 * detectType, supportsFormat and the register functions. The v12 `mermaidAPI` object is
 * removed (R-API-5). `run` and `mount` are the DOM adapter (dom.ts).
 */
import { createMermaid as createInstance, type Mermaid } from './api.ts';
import { bundledSource } from './bundled.ts';
import { discoverOnFirstUse } from './discovery.ts';
import { FIRST_PARTY } from './generated/registry.gen.ts';

export * from './exports.ts';

/**
 * A new `mermaid` API object, with its own registry and defaults and every first-party diagram.
 * In a build with `@mermaid-js/bundler-plugin`, the plugins it found register before the first
 * `prepare`, `render`, `parse` or `preload`.
 */
export function createMermaid(): Mermaid {
  const api = createInstance(FIRST_PARTY);
  if (bundledSource) discoverOnFirstUse(api, bundledSource);
  return api;
}

const mermaid = createMermaid();

export const {
  render,
  prepare,
  renderSync,
  preload,
  parse,
  initialize,
  run,
  mount,
  contentLoaded,
  detectType,
  supportsFormat,
  registerExternalDiagrams,
  registerLayoutLoaders,
  registerIconPacks,
  setParseErrorHandler,
  init,
  getRegisteredDiagramsMetadata,
} = mermaid;

// v12's `startOnLoad`: in a browser, `run()` once the page has loaded.
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('load', mermaid.contentLoaded, false);
}

export default mermaid;
