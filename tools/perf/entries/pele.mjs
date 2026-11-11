import flowchart from 'perf:pele/flowchart';
import { createRenderer } from './pele-common.mjs';
const renderer = createRenderer(flowchart);
export const name = 'pele';
export const { configure, setup, reset, render } = renderer;
