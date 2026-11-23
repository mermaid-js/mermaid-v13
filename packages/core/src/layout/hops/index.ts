// `@mermaid-js/core/layout/hops` (D537, #78): line hops at their own subpath, never re-exported from
// `@mermaid-js/core/layout`. `mermaid` imports `lineHops` statically, so hops are part of core
// (D672) and `renderSync` draws them with nothing to preload. The shared key is off by default
// (D689).
export { hopPaths, parsePath, type HopStyle, type PathCommand } from './hops.ts';
export { hopStyle, lineHops, lineHops as default } from './style.ts';
export { hopWriter } from './writer.ts';
