// `@mermaid-js/core/layout/hops` (D537, #78): line hops at their own subpath, never re-exported from
// `@mermaid-js/core/layout`, so `mermaid` loads them lazily, only for a render whose resolved
// `lineHops` is not `false`, and they stay out of the core budget's closure (R-PERF-8).
export { lineHops, parsePath, type HopStyle, type PathCommand } from './hops.ts';
export { hopPlugin, hopWriter, type HopWriter } from './writer.ts';
