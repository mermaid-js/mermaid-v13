/** One serial measurement/diagnostic child. The scheduler owns contamination and completion. */
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { collectDiagnostics } from './diagnostics.mjs';
import { runGates } from './gates.mjs';
import { runTimingWorker } from './timing-worker.mjs';
import { readJson, readSample, sha, writeJson } from './common.mjs';

const { values } = parseArgs({ options: { job: { type: 'string' } } });
const job = readJson(values.job);
const sample = readSample();
if (
  sample.pins.sampleSha256 !== job.pins.sampleSha256 ||
  sample.pins.browserSubsetSha256 !== job.pins.browserSubsetSha256
)
  throw new Error('Job sample identity mismatch');
const records = sample.records.slice(0, job.limit ?? sample.records.length);
if (job.mode === 'formal' && job.limit !== undefined)
  throw new Error('Partial formal jobs forbidden');
mkdirSync(job.out, { recursive: true });
let result;
if (job.kind === 'timing') result = await runTimingWorker(job);
else if (job.kind === 'diagnostics')
  result = await collectDiagnostics({
    manifest: job.manifest,
    records,
    out: resolve(job.out, 'diagnostics'),
    policy: job.policy,
  });
else if (job.kind === 'gates')
  result = await runGates({
    manifest: job.manifest,
    records,
    pins: job.pins,
    scope: job.mode,
    out: resolve(job.out, 'gates'),
  });
else if (job.kind === 'browser')
  result = await (
    await import('./browser.mjs')
  ).runBrowser({
    manifest: job.manifest,
    records: sample.records,
    indices: job.mode === 'rehearsal' ? sample.indices.slice(0, 3) : sample.indices,
    out: resolve(job.out, 'browser'),
    policy: job.policy,
    pins: job.pins,
    scope: job.mode,
    browserPin: job.browserPin,
  });
else throw new Error(`Unknown job kind ${job.kind}`);
writeJson(resolve(job.out, 'result.json'), { ...result, scope: job.mode, pins: job.pins });
const files = [];
function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (entry.isFile()) files.push({ path, sha256: sha(readFileSync(path)) });
    else throw new Error('Unexpected non-file in raw evidence');
  }
}
walk(job.out);
writeJson(resolve(job.out, 'evidence-tree.json'), { files });
console.log(
  JSON.stringify({ job: job.id, scope: job.mode, output: resolve(job.out, 'result.json') })
);
