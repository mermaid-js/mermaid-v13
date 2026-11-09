// `@mermaid-js/core/layout/hops` (D537, #78): line hops at their own subpath, never re-exported from
// `@mermaid-js/core/layout`, so `mermaid` loads them lazily, only for a render whose `lineHops`
// could be on, and they stay out of the core budget's closure (R-PERF-8). `lineHops` is what the
// registry loads (also re-exported by the engines whose own `lineHops` defaults on).
export { hopPaths, parsePath, type HopStyle, type PathCommand } from './hops.ts';
export { hopStyle, lineHops, lineHops as default } from './style.ts';
export { hopWriter } from './writer.ts';
