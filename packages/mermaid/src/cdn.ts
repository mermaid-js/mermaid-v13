/**
 * The CDN build's ESM entry (D162, D163, D167; spec #218 T6), bundled to
 * `dist/mermaid.esm.min.mjs`: the `mermaid` API plus three things a page without a bundler
 * needs. `globalThis.mermaid` is set; the `globalThis.mermaidPlugins` queue is connected; and
 * `initialize({ cdnBase })` sets where first-party chunks (diagrams, their text entries, the
 * themes) load from (`cdn-base.ts`). The default base is the directory this file was loaded
 * from. Diagram text can never set it (it is an integrator-only key), so no URL in a diagram
 * ever leads to a load (R-PLUG-7).
 */
import { setCdnBase, setDefaultBase } from './cdn-base.ts';
import mermaid, { initialize as initializeSite, type InitializeConfig } from './index.ts';
import { connectPluginQueue } from './plugin-queue.ts';

export * from './index.ts';

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * `initialize()`, also taking `cdnBase` (D163). Unlike the other keys, the base changes only
 * when `cdnBase` is present: `{ cdnBase: undefined }` returns to the default, and a value that
 * is not a URL string is ignored with a console warning. A missing or non-object config
 * initializes with the defaults, as v12 did.
 */
export function initialize(config?: InitializeConfig): void {
  const given = isObject(config) ? config : {};
  if ('cdnBase' in given) {
    try {
      setCdnBase(given.cdnBase);
    } catch (e) {
      console.warn(`mermaid: cdnBase ignored: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  initializeSite(given);
}

setDefaultBase(import.meta.url);
mermaid.initialize = initialize;
(globalThis as { mermaid?: unknown }).mermaid = mermaid;
connectPluginQueue(mermaid);

export default mermaid;
