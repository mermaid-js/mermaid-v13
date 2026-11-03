/**
 * The Node counterpart of the in-page harness: a child process that loads one renderer from its
 * built file and renders diagrams on request from the driver (`node-driver.ts`). Timing stops at
 * the SVG string, as there is no document to insert it into. Bundled to `dist/site/node`.
 */
import { pathToFileURL } from 'node:url';
import { errorText } from '../pipeline.ts';
import { PipelineMissing, adapterFor } from '../runner/adapters.ts';
import { sample } from '../runner/sampler.ts';
import type { FromRunner, NodeReady, NodeRunnerArgs, ToRunner } from './protocol.ts';

const args = JSON.parse(process.argv[2] ?? '{}') as NodeRunnerArgs;
const send = (m: FromRunner) => process.send!(m);
const adapter = adapterFor(
  args.renderer,
  () => import(pathToFileURL(args.entry).href) as Promise<Record<string, unknown>>
);
let seq = 0;

async function renderOnce(source: string): Promise<number> {
  // A unique trailing comment per call defeats any cache keyed on the source text.
  const input = `${source}\n%% run ${seq}\n`;
  const t0 = performance.now();
  const svg = await adapter.render(input, `d${args.renderer.replace(/\W/g, '')}${seq++}`);
  const elapsed = performance.now() - t0;
  if (!svg.includes('<svg')) throw new Error('Renderer produced no <svg> element');
  return elapsed;
}

const sampler = { renderOnce, adapter, errorText };

async function start(): Promise<NodeReady> {
  try {
    const t0 = performance.now();
    await adapter.init({ liftLimits: args.liftLimits });
    return { ok: true, initMs: performance.now() - t0 };
  } catch (e) {
    return { ok: false, missing: e instanceof PipelineMissing, error: errorText(e) };
  }
}

// Requests are handled strictly one at a time.
let queue: Promise<unknown> = start().then((ready) => send({ type: 'ready', ready }));
process.on('message', (m: ToRunner) => {
  queue = queue.then(async () =>
    send({ type: 'result', reply: await sample(sampler, m.source, m.reps, m.budgetMs) })
  );
});
