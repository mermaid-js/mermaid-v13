import { flowchart } from 'perf:v13/flowchart';
import { createRenderer } from './v13-common.mjs';
const renderer = createRenderer(flowchart);
export const name = 'v13';
export const { configure, setup, reset, render } = renderer;
