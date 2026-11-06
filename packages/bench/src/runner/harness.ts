/**
 * Runs inside each renderer's page (ported from the approaches harness `src/runner/harness.ts`).
 * Initialises one renderer, then renders diagrams on request from the Node driver.
 */
import type { IdentityOutcome } from '../identity.ts';
import { PROBE_SOURCE, errorText } from '../pipeline.ts';
import type { RendererId } from '../report.ts';
import { PipelineMissing, adapterFor } from './adapters.ts';
import type {
  BenchWindow,
  ReadyInfo,
  RenderReply,
  ResourceEntry,
  RunnerOptions,
} from './protocol.ts';
import { RENDERER_ENTRY } from './protocol.ts';
import { sample } from './sampler.ts';

const scriptStartAt = performance.now();

const params = new URLSearchParams(location.search);
const renderer = params.get('r') as RendererId;
const options: RunnerOptions = { liftLimits: params.get('liftLimits') !== 'false' };
// The URL is only known at run time, so the bundler leaves the import alone.
const adapter = adapterFor(
  renderer,
  (id) => import(RENDERER_ENTRY[id]) as Promise<Record<string, unknown>>
);
const stage = document.getElementById('stage')!;
let seq = 0;
// Time in `render()` and in the browser since `takeParts` last ran (D204).
let parts = { render: 0, browser: 0 };

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
  const t1 = performance.now();
  stage.innerHTML = svg;
  const el = stage.querySelector('svg');
  if (!el) throw new Error('Renderer produced no <svg> element');
  el.getBBox();
  const t2 = performance.now();
  parts.render += t1 - t0;
  parts.browser += t2 - t1;
  return t2 - t0;
}

function takeParts(): { render: number; browser: number } {
  const out = parts;
  parts = { render: 0, browser: 0 };
  return out;
}

const ready: Promise<ReadyInfo> = (async () => {
  try {
    const t0 = performance.now();
    await adapter.init(options);
    const initMs = performance.now() - t0;
    const readyAt = performance.now();
    // R-PERF-1 (D160): the loaded size is what a flowchart page loads, so one flowchart renders
    // before the resource list is read and its lazily imported chunks are counted. A failure
    // here shows up again on every fixture; the size is still what was fetched.
    try {
      await adapter.render(PROBE_SOURCE, `size${renderer.replace(/\W/g, '')}`);
    } catch {
      // Reported by the fixtures that fail the same way.
    }
    return { ok: true, scriptStartAt, initMs, readyAt, resources: resources() };
  } catch (e) {
    return { ok: false, missing: e instanceof PipelineMissing, error: errorText(e) };
  }
})();

const sampler = {
  renderOnce,
  takeParts,
  adapter,
  errorText,
  cleanup: () => {
    stage.innerHTML = '';
  },
};

// Requests are handled strictly one at a time.
let queue: Promise<unknown> = Promise.resolve();

function render(source: string, reps: number, budgetMs: number): Promise<RenderReply> {
  const job = queue.then(() => sample(sampler, source, reps, budgetMs));
  queue = job;
  return job;
}

// The source as given, without the per-call `%% run N` comment, so both renderers see the same text.
function renderSvg(source: string, id: string): Promise<IdentityOutcome> {
  const job = queue.then(async (): Promise<IdentityOutcome> => {
    try {
      return { svg: await adapter.render(source, id) };
    } catch (e) {
      return { error: errorText(e) };
    }
  });
  queue = job;
  return job;
}

const api: BenchWindow = { renderer, ready, render, renderSvg };
(window as unknown as { __bench: BenchWindow }).__bench = api;
