/**
 * The bundler's discovered list (`mermaid/discovered`, D164) as a first-use source of the
 * D166 seam. `undefined` unless the build found at least one plugin, so without the bundler
 * plugin (or with nothing installed) nothing changes, and Node discovery still runs in a
 * server bundle. Like Node discovery (D165), `discovery: false` turns it off.
 */
import discovered from './discovered.ts';
import type { FirstUseSource } from './discovery.ts';

export const bundledSource: FirstUseSource | undefined =
  discovered.length === 0 ? undefined : (config) => (config.discovery === false ? [] : discovered);
