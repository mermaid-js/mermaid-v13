/** Paired warmed Node rendering. Each invocation is one independent whole-sample block. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { verifyArtifacts } from './build.mjs';
import { sha256 } from './scheduler.mjs';

export function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
export function bucketFor(bytes, buckets) {
  const matches = buckets.filter(
    (bucket) => bytes >= bucket.minBytes && (bucket.maxBytes === null || bytes < bucket.maxBytes)
  );
  if (matches.length !== 1)
    throw new Error(`Size ${bytes} does not have exactly one frozen bucket`);
  return matches[0].name;
}
export function loadTimingInputs(job) {
  if (!['formal', 'rehearsal'].includes(job.mode))
    throw new Error('Explicit formal/rehearsal mode required');
  if (typeof job.manifest !== 'string' || !job.manifestSha256)
    throw new Error('A pinned artifact manifest path and hash are required');
  const manifest = verifyArtifacts(job.manifest, { expectedManifestSha256: job.manifestSha256 });
  if (
    job.experiment === 'candidate' &&
    (typeof job.headManifest !== 'string' || !job.headManifestSha256)
  )
    throw new Error('Candidate requires a pinned head manifest');
  const headManifest =
    job.experiment === 'candidate'
      ? verifyArtifacts(job.headManifest, { expectedManifestSha256: job.headManifestSha256 })
      : undefined;
  const bytes = readFileSync(job.samplePath);
  if (!job.sampleSha256 || sha256(bytes) !== job.sampleSha256)
    throw new Error('Sample hash mismatch');
  const records = bytes
    .toString('utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  if (records.length !== job.policy.sampleCount) throw new Error('Fixed sample count mismatch');
  for (const record of records)
    if (typeof record.source !== 'string' || sha256(record.source) !== record.sourceSha256)
      throw new Error('Sample source hash mismatch');
  if (job.mode === 'formal' && job.limit !== undefined)
    throw new Error('Formal measurement cannot use a partial sample');
  if (
    job.limit !== undefined &&
    (!Number.isInteger(job.limit) || job.limit < 1 || job.limit > records.length)
  )
    throw new Error('Invalid rehearsal limit');
  return { manifest, headManifest, records: records.slice(0, job.limit ?? records.length) };
}

export async function measurePairs(
  job,
  { manifest, headManifest, records },
  {
    loadEntry = async (path, side) => import(`${pathToFileURL(path).href}?timing-side=${side}`),
    clock = () => process.hrtime.bigint(),
    watchdog = () => {
      // Pure unit tests supply no parent watchdog; runTimingWorker always installs one.
    },
  } = {}
) {
  const { warmups, pairs, renderTimeoutMs } = job.policy.timing;
  if (warmups !== 3 || pairs !== 7 || !Number.isFinite(renderTimeoutMs) || renderTimeoutMs <= 0)
    throw new Error('Frozen policy requires three warmups, seven pairs and a positive timeout');
  if (!['aa', 'pele', 'trailing-comment', 'cache', 'candidate'].includes(job.experiment))
    throw new Error('Unknown P10 timing experiment');
  if (
    !Number.isInteger(job.block) ||
    job.block < 0 ||
    (job.experiment === 'aa' && job.block >= job.policy.timing.aaBlocks)
  )
    throw new Error('Invalid independent block number');
  const sides = {
    base: { engine: 'v13', analysis: true, comment: false },
    head: {
      engine: job.experiment === 'pele' ? 'pele' : 'v13',
      analysis: job.experiment !== 'cache' && job.experiment !== 'trailing-comment',
      comment: job.experiment === 'trailing-comment',
    },
  };
  for (const [side, state] of Object.entries(sides)) {
    const artifacts = side === 'head' && job.experiment === 'candidate' ? headManifest : manifest;
    if (!artifacts) throw new Error('Candidate requires a pinned head manifest');
    const path = artifacts.entries[state.engine]?.timing?.entry;
    if (!path) throw new Error(`Missing timing artifact for ${state.engine}`);
    state.api = await loadEntry(path, side);
    for (const method of ['configure', 'setup', 'reset', 'render'])
      if (typeof state.api[method] !== 'function')
        throw new Error(`Missing renderer method: ${state.engine}.${method}`);
    state.api.configure(job.configuration);
  }
  const output = [];
  let sequence = 0;
  function render(side, source, index) {
    const state = sides[side];
    // This is the explicit P10 diagnostic exception to P9, never the acceptance path.
    const input = state.comment ? `${source}\n%% perf-p10-trailing-comment-${sequence++}` : source;
    state.api.reset({ analysis: state.analysis });
    watchdog({ operation: `${side}.render[${index}]`, timeoutMs: renderTimeoutMs });
    const start = clock();
    const svg = state.api.render(input, index);
    const elapsed = Number(clock() - start);
    watchdog({ operation: null });
    if (svg && typeof svg.then === 'function')
      throw new Error('Timing entry render must be synchronous');
    if (typeof svg !== 'string' || !/<svg(?:\s|\/?>)/.test(svg))
      throw new Error(`Invalid SVG: ${side}, record ${index}`);
    if (!(elapsed > 0) || elapsed > renderTimeoutMs * 1e6)
      throw new Error(`Render duration invalid or timed out: ${side}, record ${index}`);
    return elapsed;
  }
  for (let index = 0; index < records.length; index++) {
    const record = records[index];
    for (const side of ['base', 'head']) {
      watchdog({ operation: `${side}.setup[${index}]`, timeoutMs: renderTimeoutMs });
      await sides[side].api.setup(record.source);
      watchdog({ operation: null });
      for (let warmup = 0; warmup < warmups; warmup++) render(side, record.source, index);
    }
    const result = {
      index,
      sourceSha256: record.sourceSha256,
      sourceBytes: Buffer.byteLength(record.source),
      bucket: bucketFor(Buffer.byteLength(record.source), job.policy.buckets),
      base: [],
      head: [],
      pairOrder: [],
    };
    for (let pair = 0; pair < pairs; pair++) {
      const order = (index + pair + job.block) % 2 === 0 ? ['base', 'head'] : ['head', 'base'];
      result.pairOrder.push(order.join('/'));
      for (const side of order) result[side].push(render(side, record.source, index));
    }
    result.baseMedianNs = median(result.base);
    result.headMedianNs = median(result.head);
    output.push(result);
  }
  if (!output.length) throw new Error('Empty timing job');
  return {
    schemaVersion: 1,
    experiment: job.experiment,
    block: job.block,
    mode: job.mode,
    completed: true,
    contaminated: false,
    timingEligible: job.mode === 'formal',
    caveat:
      job.mode === 'rehearsal'
        ? 'Infrastructure rehearsal only; numbers discarded and unfit for timing.'
        : undefined,
    sampleSha256: job.sampleSha256,
    manifestSha256: job.manifestSha256,
    headManifestSha256: job.headManifestSha256,
    policy: job.policy,
    measuredRecords: output.length,
    fixedSampleCount: job.policy.sampleCount,
    units: 'nanoseconds',
    comparison: {
      base: sides.base.engine,
      head: sides.head.engine,
      baseCache: 'off',
      headCache: job.experiment === 'cache' ? 'on' : 'off',
      sourceMutation:
        job.experiment === 'trailing-comment'
          ? 'explicit P10 trailing-comment diagnostic only'
          : 'none',
    },
    records: output,
  };
}

export function runTimingWorker(job) {
  return new Promise((resolveResult, reject) => {
    const worker = new Worker(new URL(import.meta.url), { workerData: { job } });
    let settled = false;
    let timer;
    const arm = (operation, timeoutMs) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        settled = true;
        void worker.terminate();
        reject(new Error(`Timing worker timeout: ${operation}`));
      }, timeoutMs);
    };
    arm('startup', 120000);
    worker.on('message', (message) => {
      if (message.type === 'watchdog') {
        if (message.operation) arm(message.operation, message.timeoutMs);
        else arm('between renders', 120000);
      }
      if (message.type === 'result') {
        settled = true;
        clearTimeout(timer);
        resolveResult(message.result);
      }
    });
    worker.on('error', (error) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
    worker.on('exit', (code) => {
      clearTimeout(timer);
      if (!settled) reject(new Error(`Timing worker exited without complete evidence (${code})`));
    });
  });
}

if (!isMainThread && workerData?.job) {
  const input = loadTimingInputs(workerData.job);
  const result = await measurePairs(workerData.job, input, {
    watchdog: (event) => parentPort.postMessage({ type: 'watchdog', ...event }),
  });
  parentPort.postMessage({ type: 'result', result });
} else if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values } = parseArgs({ options: { job: { type: 'string' }, out: { type: 'string' } } });
  if (!values.job || !values.out)
    throw new Error('Usage: node tools/perf/timing-worker.mjs --job job.json --out output.json');
  const result = await runTimingWorker(JSON.parse(readFileSync(values.job, 'utf8')));
  mkdirSync(dirname(resolve(values.out)), { recursive: true });
  writeFileSync(values.out, `${JSON.stringify(result)}\n`);
}
