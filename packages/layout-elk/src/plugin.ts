/**
 * The eager module of the package's `layout` manifest (`"config": "./dist/plugin.js"`, D177):
 * discovery imports it when it finds the package, before any diagram names an ELK layout. It is
 * as small as the entry: the `elk` config fragment (D153) and the package's extension
 * (its warnings). The engine and elkjs still load only when a diagram names one of
 * the layouts. The extension is the entry's own object, so it sees the engine the entry loads.
 */
export { configFragment as config } from './generated/config-fragment.ts';
export { elkExtension as extension } from './index.ts';
