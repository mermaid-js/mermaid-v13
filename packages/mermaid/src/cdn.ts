/**
 * The CDN build's ESM entry (D162, D163, D167; spec #218 T6), bundled to
 * `dist/mermaid.esm.min.mjs`: the `mermaid` API plus three things a page without a bundler
 * needs. `globalThis.mermaid` is set; the `globalThis.mermaidPlugins` queue is connected; and
 * `initialize({ cdnBase })` sets where first-party chunks (diagrams, their text entries, the
 * themes) load from (`cdn-base.ts`). The default base is the directory this file was loaded
 * from. Diagram text can never set it (it is an integrator-only key), so no URL in a diagram
 * ever leads to a load (R-PLUG-7).
 */
import type { Mermaid } from './api.ts';
import { setCdnBase, setDefaultBase } from './cdn-base.ts';
import { isPlain as isObject } from './config-snapshot.ts';
import mermaid, {
  createMermaid as createSite,
  initialize as initializeSite,
  type InitializeConfig,
} from './index.ts';
import { connectPluginQueue, queueOwnedElsewhere, warnTwoCopies } from './plugin-queue.ts';

export * from './index.ts';

/** Marks the default API object of a CDN build copy, as `globalThis.mermaid`. */
const CDN_COPY = 'mermaid:cdnCopy';

/**
 * `init`, also taking `cdnBase` (D163). Unlike the other keys, the base changes only when
 * `cdnBase` is present: `{ cdnBase: undefined }` returns to the default, and a value that is
 * not a URL string is ignored with a console warning. A missing or non-object config
 * initializes with the defaults, as v12 did. The base is one per build copy (chunks are
 * module singletons), so every API object of the copy sets the same one.
 */
function withCdnBase(init: (config: InitializeConfig) => void) {
  return (config?: InitializeConfig): void => {
    const given = isObject(config) ? config : {};
    if ('cdnBase' in given) {
      try {
        setCdnBase(given.cdnBase);
      } catch (e) {
        console.warn(`mermaid: cdnBase ignored: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    init(given);
  };
}

/** `initialize()` of the default API object, also taking `cdnBase` (D163). */
export const initialize = withCdnBase(initializeSite);

setDefaultBase(import.meta.url);
mermaid.initialize = initialize;

// A second copy of the build on the page (another URL): the first keeps `globalThis.mermaid`,
// the plugin queue and the startOnLoad render, so `.mermaid` elements render once.
const g = globalThis as { mermaid?: Record<PropertyKey, unknown> };
const otherCopy = g.mermaid !== undefined && g.mermaid !== mermaid && g.mermaid[CDN_COPY] === true;
const second = queueOwnedElsewhere() || otherCopy;
if (second) {
  warnTwoCopies();
  if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function')
    window.removeEventListener('load', mermaid.contentLoaded, false);
  // The classic loader calls contentLoaded itself after the load event: a no-op here too.
  mermaid.contentLoaded = () => undefined;
} else {
  Object.defineProperty(mermaid, CDN_COPY, { value: true });
  g.mermaid = mermaid as never;
  connectPluginQueue(mermaid);
}

/**
 * A new `mermaid` API object of this build: its own registry and defaults, every plugin the
 * `globalThis.mermaidPlugins` queue has taken or takes later, and `initialize({ cdnBase })`.
 */
export function createMermaid(): Mermaid {
  const api = createSite();
  api.initialize = withCdnBase(api.initialize);
  if (!second) connectPluginQueue(api);
  return api;
}

export default mermaid;
