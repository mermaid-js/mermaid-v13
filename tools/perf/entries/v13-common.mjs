// Adapted from mermaid-perf-lab/entries/v13.ts; provenance is in LAB-SOURCES.json.
import { createMermaid } from 'perf:v13/slim';
import { canvasMeasurer } from 'perf:v13/measurer';
import { resetAnalysis } from 'perf:v13/reset';

export function createRenderer(plugin, instrumentMeasurer) {
  const api = createMermaid({ diagrams: [plugin] });
  let inner = canvasMeasurer();
  // Node retains its native table-measurer path; the browser delegate lets reset replace the
  // width cache without changing the initialized configuration snapshot.
  const canvas = inner
    ? {
        id: inner.id,
        width: (...args) => inner.width(...args),
        metrics: (...args) => inner.metrics(...args),
      }
    : undefined;
  const measurer = instrumentMeasurer ? instrumentMeasurer(canvas) : canvas;
  let configured = false;
  function configure() {
    if (configured) return;
    api.initialize({ maxTextSize: 10000000, maxEdges: 1000000, ...(measurer ? { measurer } : {}) });
    configured = true;
  }
  async function setup(source) {
    configure();
    await api.prepare(source);
  }
  function reset({ analysis = true } = {}) {
    if (!configured) throw new Error('Call configure or setup before reset');
    if (analysis) resetAnalysis(api);
    if (inner) inner = canvasMeasurer();
  }
  function render(source, index) {
    if (!configured) throw new Error('Call configure or setup before render');
    return api.renderSync(source, { id: `m${index}` }).svg;
  }
  return { api, configure, setup, reset, render };
}
