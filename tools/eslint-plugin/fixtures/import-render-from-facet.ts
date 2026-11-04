// The facet's own modules (`src/facet/`: completions, hover, tables) are reachable from the
// language entry, so they never reach the renderer, the plugin or ASCII code either.
export { renderFlowchart } from '../render/render.ts';
export { flowchart } from '../plugin.ts';
export { renderAscii } from '../ascii.ts';
