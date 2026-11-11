import { flowchart, parseFlowchart, FlowTokenKind } from 'perf:v13/flowchart';
import { preprocess } from 'perf:v13/preprocess';
import { Kind } from 'perf:v13/parser-kit';
import { tableMeasurer } from 'perf:v13/text';
import { installStageClock } from 'perf:v13/timing';
import { createRenderer } from './v13-common.mjs';
import { counters, inspection, recordStage } from './v13-counters.mjs';

const plugin = {
  ...flowchart,
  parse(...args) {
    counters.parserCalls++;
    return flowchart.parse(...args);
  },
};
const renderer = createRenderer(plugin, (canvas) => {
  const inner = canvas ?? tableMeasurer;
  return {
    id: inner.id,
    width(...args) {
      counters.measurerCalls++;
      return inner.width(...args);
    },
    metrics(...args) {
      counters.metricsCalls++;
      return inner.metrics(...args);
    },
  };
});
installStageClock({
  now: () => performance.now(),
  record: recordStage,
});
export const name = 'v13';
export const { configure, setup, reset, render } = renderer;
export function stats() {
  return structuredClone(counters);
}
export function resetStats() {
  counters.parserCalls = counters.measurerCalls = counters.metricsCalls = 0;
  counters.stages = {};
}
export async function verifyReset() {
  const source = 'flowchart TD\nA[Cache probe]-->B';
  await setup(source);
  reset();
  resetStats();
  const first = render(source, 0);
  const fresh = stats().parserCalls;
  reset({ analysis: false });
  const second = render(source, 0);
  const cached = stats().parserCalls;
  reset();
  const third = render(source, 0);
  const reparsed = stats().parserCalls;
  if (
    fresh !== 1 ||
    cached !== 1 ||
    reparsed !== 2 ||
    first !== second ||
    first !== third ||
    stats().measurerCalls === 0
  )
    throw new Error('Analysis reset/cache-on behavioral verification failed');
  reset();
  resetStats();
  return { fresh, cached, reparsed, identical: true };
}
export async function inspect(source) {
  await setup(source);
  const prepared = await renderer.api.prepare(source);
  const model = prepared.parse.model;
  const pre = preprocess(source);
  const tokens = parseFlowchart(source, {
    preprocessed: pre,
    keepTokens: true,
    maxEdges: 1000000,
  }).tokens;
  const countToken = (kind) => [...tokens.kind].filter((item) => item === kind).length;
  inspection.enabled = true;
  inspection.labels = inspection.wideLabels = 0;
  try {
    render(source, 0);
    return {
      nodes: model.vertices.length,
      edges: model.edges.length,
      subgraphs: model.subgraphs.length,
      labelledEdges: model.edges.filter((edge) => edge.text.length > 0).length,
      labels: inspection.labels,
      wideLabels: inspection.wideLabels,
      frontMatter: Number(pre.frontMatter !== undefined),
      initDirectives: pre.directives.filter((directive) => directive.kind === 'init').length,
      themeVariables: Number(
        Object.hasOwn(pre.frontMatter?.config ?? {}, 'themeVariables') ||
          pre.directives.some(
            (directive) =>
              directive.args &&
              typeof directive.args === 'object' &&
              Object.hasOwn(directive.args, 'themeVariables')
          )
      ),
      shapeData: countToken(FlowTokenKind.ShapeData),
      comments: countToken(Kind.Comment),
      wideLabelMethod:
        'Unwrapped layoutLabel width exceeds the actual positive finite wrap argument; actual font/style/options, diagnostic-only second layout.',
    };
  } finally {
    inspection.enabled = false;
    reset();
    resetStats();
  }
}
