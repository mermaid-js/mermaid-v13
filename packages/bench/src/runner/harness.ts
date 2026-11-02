/**
 * Runs inside each renderer's page (ported from the approaches harness `src/runner/harness.ts`).
 * Initialises one renderer, then renders diagrams on request from the Node driver.
 */
import { errorText } from '../pipeline.ts';
import type { RendererId, Stage } from '../report.ts';
import { STAGES } from '../report.ts';
import { PipelineMissing, adapterFor } from './adapters.ts';
import type {
  BenchWindow,
  ReadyInfo,
  RenderReply,
  ResourceEntry,
  RunnerOptions,
} from './protocol.ts';

const scriptStartAt = performance.now();
// Browser timers are coarsened to about 0.1 ms, and v13 renders tiny diagrams well under that,
// so each warm sample times a batch of renders sized to last at least 2 ms.
const MIN_SAMPLE_MS = 2;
const MAX_BATCH = 500;

const params = new URLSearchParams(location.search);
const renderer = params.get('r') as RendererId;
const options: RunnerOptions = { liftLimits: params.get('liftLimits') !== 'false' };
const adapter = adapterFor(renderer);
const stage = document.getElementById('stage')!;
let seq = 0;

function resources(): ResourceEntry[] {
  return (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).map((e) => ({
    name: e.name,
    decodedBodySize: e.decodedBodySize,
    transferSize: e.transferSize,
  }));
}

// Render, insert into the document and force layout, so every renderer is timed to the same
// end state: an SVG in the document with its geometry computed.
async function renderOnce(source: string): Promise<number> {
  // A unique trailing comment per call defeats any cache keyed on the source text.
  const input = `${source}\n%% run ${seq}\n`;
  const t0 = performance.now();
  const svg = await adapter.render(input, `d${renderer.replace(/\W/g, '')}${seq++}`);
  stage.innerHTML = svg;
  const el = stage.querySelector('svg');
  if (!el) throw new Error('Renderer produced no <svg> element');
  el.getBBox();
  return performance.now() - t0;
}

const ready: Promise<ReadyInfo> = (async () => {
  try {
    const t0 = performance.now();
    await adapter.init(options);
    const initMs = performance.now() - t0;
    return { ok: true, scriptStartAt, initMs, readyAt: performance.now(), resources: resources() };
  } catch (e) {
    return { ok: false, missing: e instanceof PipelineMissing, error: errorText(e) };
  }
})();

// Requests are handled strictly one at a time.
let queue: Promise<unknown> = Promise.resolve();

function render(source: string, reps: number, budgetMs: number): Promise<RenderReply> {
  const job = queue.then(async (): Promise<RenderReply> => {
    try {
      const firstMs = await renderOnce(source);
      let batch = 1;
      if (reps > 0) {
        const probe = await renderOnce(source);
        if (probe < MIN_SAMPLE_MS)
          batch = Math.min(MAX_BATCH, Math.ceil(MIN_SAMPLE_MS / Math.max(probe, 0.02)));
      }
      const samples: number[] = [];
      const stageSamples: Partial<Record<Stage, number[]>> = {};
      let spent = 0;
      for (let i = 0; i < reps; i++) {
        // Always take at least one warm sample; then stop once the budget is spent.
        if (i > 0 && spent > budgetMs) break;
        adapter.takeStages?.();
        const t0 = performance.now();
        for (let b = 0; b < batch; b++) await renderOnce(source);
        const elapsed = performance.now() - t0;
        samples.push(elapsed / batch);
        spent += elapsed;
        const st = adapter.takeStages?.() ?? {};
        for (const s of STAGES) {
          const v = st[s];
          if (v !== undefined) (stageSamples[s] ??= []).push(v / batch);
        }
      }
      return { ok: true, firstMs, samples, batch, stageSamples };
    } catch (e) {
      return { ok: false, error: errorText(e) };
    } finally {
      stage.innerHTML = '';
    }
  });
  queue = job;
  return job;
}

const api: BenchWindow = { renderer, ready, render };
(window as unknown as { __bench: BenchWindow }).__bench = api;
