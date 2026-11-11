// Adapted from mermaid-perf-lab/entries/pele.ts; retain Pele's defaults apart from approved limits.
import { forgetTextWidths, register, render as peleRender } from 'perf:pele/core';
export function createRenderer(plugin) {
  register(plugin);
  return {
    configure() {
      // Pele applies the fixed limits per call and has no site configuration to initialize.
    },
    async setup() {
      // The minimal registered plugin has no lazy resources to preload.
    },
    reset() {
      forgetTextWidths();
    },
    render(source, index) {
      return peleRender(source, {
        idPrefix: `p${index}`,
        limit: 10000000,
        maxEdges: 1000000,
        outputLimit: Number.MAX_SAFE_INTEGER,
      }).svg;
    },
  };
}
