import flowchart from 'perf:pele/flowchart';
import { createRenderer } from './pele-common.mjs';
import { counters } from './pele-counters.mjs';
const renderer = createRenderer({
  ...flowchart,
  parse(...args) {
    counters.parserCalls++;
    return flowchart.parse(...args);
  },
});
export const name = 'pele';
export const { configure, setup, reset, render } = renderer;
export function stats() {
  return { ...counters };
}
export function resetStats() {
  counters.parserCalls = counters.measurerCalls = 0;
}
export async function verifyReset() {
  const source = 'flowchart TD\nA[Cache probe]-->B';
  await setup(source);
  reset();
  resetStats();
  const first = render(source, 0);
  reset();
  const second = render(source, 0);
  if (counters.parserCalls !== 2 || counters.measurerCalls === 0 || first !== second)
    throw new Error('Pele parser/measurer instrumentation verification failed');
  const result = {
    parserCalls: counters.parserCalls,
    measurerCalls: counters.measurerCalls,
    identical: true,
  };
  reset();
  resetStats();
  return result;
}
