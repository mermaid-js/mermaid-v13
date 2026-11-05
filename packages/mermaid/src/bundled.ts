/**
 * The bundler's discovered list (`mermaid/discovered`, D164) as a first-use source of the
 * D166 seam. `undefined` when the module is the empty one shipped with `mermaid` (no bundler
 * plugin), so nothing changes then. Like Node discovery (D165), `discovery: false` turns it off.
 */
import discovered, { warnings } from './discovered.ts';
import type { FirstUseSource } from './discovery.ts';

export const bundledSource: FirstUseSource | undefined =
  discovered.length === 0 && warnings.length === 0
    ? undefined
    : (config, warn) => {
        if (config.discovery === false) return [];
        for (const w of warnings) warn(w);
        return discovered;
      };
