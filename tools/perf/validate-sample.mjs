/** Untimed sample preflight. Run from the repo root; see v13/docs/perf/SAMPLE.md. */
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    input: { type: 'string' },
    out: { type: 'string' },
    count: { type: 'string', default: '5000' },
    timeout: { type: 'string', default: '30000' },
    policy: { type: 'string', default: 'common-renderable' },
  },
});
if (!values.input || !values.out) throw new Error('--input and --out are required');
if (!['common-renderable', 'fixed-random'].includes(values.policy))
  throw new Error('invalid policy');
const count = Number(values.count);
const timeout = Number(values.timeout);
if (!Number.isSafeInteger(count) || count < 1 || !Number.isSafeInteger(timeout) || timeout < 1)
  throw new Error('count and timeout must be positive integers');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const out = resolve(values.out);
const local = relative(root, out);
if (local === '' || (!local.startsWith('../') && !local.startsWith('/')))
  execFileSync('git', ['check-ignore', '-q', resolve(out, 'sample.jsonl')], { cwd: root });
if (existsSync(resolve(out, 'report.json')) || existsSync(resolve(out, 'attempts.jsonl')))
  throw new Error('output already contains results; choose a new directory');
mkdirSync(out, { recursive: true });
const inputBytes = readFileSync(resolve(values.input));
const candidates = inputBytes
  .toString('utf8')
  .trim()
  .split('\n')
  .map((line) => JSON.parse(line));
const sha = (data) => createHash('sha256').update(data).digest('hex');
for (const record of candidates)
  if (typeof record.source !== 'string' || sha(record.source) !== record.sourceSha256)
    throw new Error('candidate source hash mismatch');

const workerSource = `
import { parentPort, workerData } from 'node:worker_threads';
import { createMermaid } from '../../packages/mermaid/src/slim.ts';
import { flowchart } from '../../packages/diagram-flowchart/src/index.ts';
import { register, render as peleRender } from 'pele/core';
import peleFlowchart from 'pele/diagrams/flowchart';
register(peleFlowchart);
const m = createMermaid({ diagrams: [flowchart] });
m.initialize({ maxTextSize: 10000000, maxEdges: 1000000 });
parentPort.on('message', async ({source}) => {
  try {
    let svg;
    if (workerData === 'v13') {
      const type = m.detectType(source);
      if (type !== 'flowchart-v2' && type !== 'flowchart-elk') {
        parentPort.postMessage({ok:false, reason:'NON_FLOWCHART'}); return;
      }
      svg = (await m.render('sample', source)).svg;
    } else {
      svg = peleRender(source, { limit: 10000000, maxEdges: 1000000, outputLimit: Number.MAX_SAFE_INTEGER }).svg;
    }
    const ok = typeof svg === 'string' && svg.includes('<svg') && svg.includes('</svg>');
    parentPort.postMessage({ok, reason:ok ? null : 'NO_SVG', outputBytes:ok ? Buffer.byteLength(svg) : null});
  } catch(e) {
    const code = typeof e?.code === 'string' && /^[A-Z][A-Z0-9_]{0,60}$/.test(e.code) ? e.code : 'RENDER_ERROR';
    parentPort.postMessage({ok:false, reason:code});
  }
});
parentPort.postMessage({ready:true});
`;
const workerFile = resolve(out, 'preflight-worker.mjs');
await build({
  stdin: {
    contents: workerSource,
    resolveDir: resolve(root, 'tools/perf'),
    sourcefile: 'preflight-worker.ts',
  },
  outfile: workerFile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'es2022',
  conditions: ['mermaid-source'],
  nodePaths: [resolve(root, 'packages/bench/node_modules')],
  define: { __MERMAID_BENCH__: 'false' },
  logLevel: 'silent',
});

class Renderer {
  constructor(kind) {
    this.kind = kind;
    this.worker = undefined;
  }
  async start() {
    const worker = new Worker(workerFile, { workerData: this.kind, stdout: true, stderr: true });
    this.worker = worker;
    // Diagnostics can contain source text; record only structured outcomes in private artifacts.
    worker.stdout.resume();
    worker.stderr.resume();
    await new Promise((done, fail) => {
      const timer = setTimeout(() => fail(new Error('worker startup timeout')), timeout);
      worker.once('message', (message) => {
        clearTimeout(timer);
        if (message.ready) done();
        else fail(new Error('invalid worker handshake'));
      });
      worker.once('error', (error) => {
        clearTimeout(timer);
        fail(error);
      });
    });
  }
  async render(source) {
    if (!this.worker) await this.start();
    const worker = this.worker;
    const result = await new Promise((done) => {
      const finish = (outcome) => {
        clearTimeout(timer);
        worker.removeAllListeners('message');
        worker.removeAllListeners('error');
        worker.removeAllListeners('exit');
        done(outcome);
      };
      const timer = setTimeout(() => finish({ ok: false, reason: 'TIMEOUT' }), timeout);
      worker.once('message', finish);
      worker.once('error', () => finish({ ok: false, reason: 'WORKER_ERROR' }));
      worker.once('exit', () => finish({ ok: false, reason: 'WORKER_EXIT' }));
      worker.postMessage({ source });
    });
    if (['TIMEOUT', 'WORKER_ERROR', 'WORKER_EXIT'].includes(result.reason)) {
      await worker.terminate();
      this.worker = undefined;
      // Infrastructure failures must not silently bias selection; timeouts are explicit eligibility outcomes.
      if (result.reason !== 'TIMEOUT') throw new Error(`${this.kind}: ${result.reason}`);
    }
    return result;
  }
  async close() {
    if (this.worker) await this.worker.terminate();
  }
}

const renderers = [new Renderer('v13'), new Renderer('pele')];
const selected = [];
const reasons = {};
let attempted = 0;
try {
  // Fail the run if the environment cannot render a known valid flowchart.
  for (const renderer of renderers)
    if (!(await renderer.render('flowchart TD\nA-->B')).ok)
      throw new Error(`${renderer.kind}: smoke render failed`);
  for (const candidate of candidates) {
    const results = {};
    for (const renderer of renderers)
      results[renderer.kind] = await renderer.render(candidate.source);
    const eligible = results.v13.ok && results.pele.ok;
    attempted++;
    appendFileSync(
      resolve(out, 'attempts.jsonl'),
      JSON.stringify({ ordinal: candidate.ordinal, results, eligible }) + '\n'
    );
    for (const [kind, result] of Object.entries(results)) {
      if (!result.ok) {
        const reason = `${kind}:${result.reason}`;
        reasons[reason] = (reasons[reason] ?? 0) + 1;
      }
    }
    if (eligible || values.policy === 'fixed-random') selected.push(candidate);
    if (attempted % 100 === 0)
      console.log(JSON.stringify({ attempted, selected: selected.length, reasons }));
    if (selected.length === count) break;
  }
  if (selected.length !== count)
    throw new Error('candidate pool exhausted; extend it with the same seed');
  const bytes = selected.map((record) => JSON.stringify(record) + '\n').join('');
  writeFileSync(resolve(out, 'sample.jsonl'), bytes);
  // Independent hash ranking makes the browser subset fixed and distributed across the sample.
  const subset = selected
    .map((record, index) => ({ index, rank: sha(`browser-v1\0${record.ordinal}`) }))
    .sort((a, b) => a.rank.localeCompare(b.rank) || a.index - b.index)
    .slice(0, Math.min(500, count))
    .map(({ index }) => index)
    .sort((a, b) => a - b);
  const subsetBytes = JSON.stringify(subset) + '\n';
  writeFileSync(resolve(out, 'browser-indices.json'), subsetBytes);
  const sourceLengths = selected.map((r) => Buffer.byteLength(r.source)).sort((a, b) => a - b);
  const report = {
    schema: 1,
    purpose: 'untimed sample validation; not performance evidence',
    policy: values.policy,
    timeoutMs: timeout,
    requested: count,
    selected: selected.length,
    attempted,
    excluded: attempted - selected.length,
    failureCounts: reasons,
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim(),
    pele: JSON.parse(
      readFileSync(resolve(root, 'packages/bench/node_modules/pele/package.json'), 'utf8')
    ).version,
    inputSha256: sha(inputBytes),
    workerSha256: sha(readFileSync(workerFile)),
    sampleSha256: sha(bytes),
    browserSubsetSha256: sha(subsetBytes),
    browserCount: subset.length,
    limits: { maxTextSize: 10000000, maxEdges: 1000000, peleOutputLimit: Number.MAX_SAFE_INTEGER },
    sourceBytes: {
      min: sourceLengths[0],
      median: sourceLengths[Math.floor(count / 2)],
      max: sourceLengths.at(-1),
    },
  };
  writeFileSync(resolve(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally {
  for (const renderer of renderers) await renderer.close();
}
