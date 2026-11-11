/** Hop 4 attribution only. The coordinator supplies acceptance and the exclusive runQueue. */
import assert from 'node:assert/strict';
import { Worker, parentPort, workerData } from 'node:worker_threads';
import { serialize } from 'node:v8';
import { build, version as esbuildVersion } from 'esbuild';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildArtifacts, verifyArtifacts } from './build.mjs';
import { bucketFor, readJson, requirePrivate, root, sha } from './common.mjs';

const self = fileURLToPath(import.meta.url);
const LAYERED = 'packages/core/src/layout/layered/index.ts';
const RENDER = 'packages/diagram-flowchart/src/render/render.ts';
const TARGETS = {
  [LAYERED]: 'd56e483c2b7c0d4482a83e3d20fbcfbf1fce8336c51047216363282ba78b4790',
  [RENDER]: 'be748855e4e1a6f04715914e31fbc41e1fd52faa4daf2e07a7f1c2edbe4010d5',
};
const SAMPLE = '6d3dcb57cc8408a195df49a634cf08ae974cff6d6fd20b5edb2cc60a9fe651d8';
export const HOP4_BOUNDARY = {
  start: 'run(): immediately after compoundLayout returns, before margin/pad computation',
  end: 'run(): after the returned LayoutModel object is constructed, before return',
  includes: [
    'margin/pad',
    'node/group/edge maps and objects',
    'group slice and projection',
    'route points and ports',
    'self-loop generation',
    'bounds/direction',
  ],
  excludes: [
    'CNode/CEdge construction',
    'compoundLayout',
    'endLabels',
    'outer width-fit/grid-growth work',
    'capture and statistics recording',
  ],
  passes: 'All executed run() conversions, including discarded tight/turned/growth results',
  clock: 'performance.now(), microseconds; two clock reads per conversion invocation',
};
export const HOP4_LIMITATIONS = [
  'Diagnostic attribution only; no acceptance speedup, fit verdict or interface decision.',
  'Instrumentation changes JIT/code layout, allocation and GC scheduling; matching build settings cannot eliminate that bias.',
  'Empty clock-pair controls estimate clock overhead, not all instrumentation bias. No overhead is subtracted.',
  'Spread describes seven repetitions of this run, not a confidence interval or independent A/A blocks.',
  'Hop/total proportion uses instrumented end-to-end time, whose denominator includes recording overhead.',
  'A summed conversion cost is not an achievable optimization gain: required route, loop and port work is included.',
];
const filePin = (path) => ({ path: resolve(path), sha256: sha(readFileSync(path)) });
const immutableJson = (path, value) =>
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o444 });
function replaceOnce(source, target, replacement) {
  if (source.split(target).length !== 2) throw Error('Hop-4 instrumentation boundary moved');
  return source.replace(target, replacement);
}
export function instrumentHop4(source, path, variant) {
  if (!['plain', 'control', 'instrumented'].includes(variant)) throw Error('Unknown hop-4 variant');
  if (!(path in TARGETS)) return source;
  if (sha(source) !== TARGETS[path]) throw Error('Hop-4 instrumentation source pin mismatch');
  if (variant === 'plain') return source;
  const timed = variant === 'instrumented';
  if (path === LAYERED) {
    source = replaceOnce(
      source,
      '  const total = compoundLayout(cnodes, cedges, rootDir, opt);',
      '  const total = compoundLayout(cnodes, cedges, rootDir, opt);' +
        (timed ? '\n  const __hop4Start = performance.now();' : '')
    );
    source = replaceOnce(
      source,
      '  return {\n    width: total.width + 2 * margin,',
      '  const __hop4Model = {\n    width: total.width + 2 * margin,'
    );
    source = replaceOnce(
      source,
      '    direction: rootDir,\n  };\n}',
      '    direction: rootDir,\n  };\n' +
        (timed ? '  const __hop4Us = (performance.now() - __hop4Start) * 1000;\n' : '') +
        `  observeHop4(__hop4Model${timed ? ', __hop4Us' : ''});\n  return __hop4Model;\n}`
    );
    return "import { observeHop4 } from 'perf:hop4/state';\n" + source;
  }
  source = replaceOnce(
    source,
    '  const laid = (ctx.layout ?? layered)(prepared.graph);',
    '  const laid = (ctx.layout ?? layered)(prepared.graph);\n  observeFinal(laid);'
  );
  return "import { observeFinal } from 'perf:hop4/state';\n" + source;
}

export async function buildHop4Artifacts({ out, v13 = root } = {}) {
  if (!out || existsSync(out)) throw Error('Fresh explicit artifact directory required');
  out = resolve(out);
  requirePrivate(resolve(out, 'manifest.json'));
  const normal = await buildArtifacts({ v13, out: resolve(out, 'normal') });
  const sources = new Map(normal.manifest.sources.map((f) => [f.path, f.sha256]));
  const remember = (path) => {
    const pin = filePin(path);
    if (sources.has(pin.path) && sources.get(pin.path) !== pin.sha256)
      throw Error('Source changed during build');
    sources.set(pin.path, pin.sha256);
  };
  remember(self);
  const artifacts = [];
  const entries = {};
  const aliases = {
    'perf:v13/slim': resolve(v13, 'packages/mermaid/src/slim.ts'),
    'perf:v13/measurer': resolve(v13, 'packages/mermaid/src/measurer.ts'),
    'perf:v13/reset': resolve(v13, 'packages/mermaid/src/analysis-reset.ts'),
    'perf:v13/flowchart': resolve(v13, 'packages/diagram-flowchart/src/index.ts'),
    'perf:hop4/state': resolve(root, 'tools/perf/entries/hop4-state.mjs'),
  };
  for (const variant of ['plain', 'control', 'instrumented']) {
    const outdir = resolve(out, variant);
    const result = await build({
      entryPoints: [resolve(root, 'tools/perf/entries/v13-hop4.mjs')],
      absWorkingDir: v13,
      outdir,
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2022',
      conditions: ['mermaid-source'],
      alias: aliases,
      define: { __MERMAID_BENCH__: 'false' },
      splitting: true,
      minify: true,
      entryNames: 'index',
      chunkNames: 'chunks/[name]-[hash]',
      outExtension: { '.js': '.mjs' },
      legalComments: 'none',
      logLevel: 'warning',
      metafile: true,
      write: false,
      plugins: [
        {
          name: 'hop4-diagnostic-only',
          setup(builder) {
            builder.onLoad({ filter: /\.(?:[cm]?js|ts|json)$/ }, ({ path }) => {
              remember(path);
              for (let directory = dirname(path); ; directory = dirname(directory)) {
                for (const name of ['package.json', 'tsconfig.json']) {
                  const metadata = resolve(directory, name);
                  if (existsSync(metadata)) remember(metadata);
                }
                if (directory === dirname(directory)) break;
              }
              let contents = readFileSync(path, 'utf8');
              for (const target of Object.keys(TARGETS))
                if (path === resolve(v13, target))
                  contents = instrumentHop4(contents, target, variant);
              return {
                contents,
                loader: extname(path) === '.ts' ? 'ts' : extname(path) === '.json' ? 'json' : 'js',
              };
            });
          },
        },
      ],
    });
    mkdirSync(outdir, { recursive: true });
    for (const file of result.outputFiles) {
      mkdirSync(dirname(file.path), { recursive: true });
      writeFileSync(file.path, file.contents, { flag: 'wx', mode: 0o444 });
      artifacts.push(filePin(file.path));
    }
    const metafile = resolve(outdir, 'metafile.json');
    immutableJson(metafile, result.metafile);
    artifacts.push(filePin(metafile));
    entries[variant] = resolve(outdir, 'index.mjs');
  }
  const sourceList = [...sources]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, sha256]) => ({ path, sha256 }));
  const manifest = {
    schema: 1,
    purpose: 'hop4-diagnostic-only',
    node: process.version,
    esbuildVersion,
    normal: filePin(normal.manifestPath),
    entries,
    sources: sourceList,
    artifacts,
    sourceDigest: sha(JSON.stringify(sourceList)),
    artifactDigest: sha(JSON.stringify(artifacts)),
    boundary: HOP4_BOUNDARY,
    settings: { minify: true, splitting: true, benchStages: false },
  };
  const manifestPath = resolve(out, 'manifest.json');
  immutableJson(manifestPath, manifest);
  verifyHop4Artifacts(manifestPath);
  return { manifest, manifestPath, manifestSha256: sha(readFileSync(manifestPath)) };
}

export function verifyHop4Artifacts(input) {
  const manifest = typeof input === 'string' ? readJson(input) : input;
  assert.equal(manifest.purpose, 'hop4-diagnostic-only');
  assert.equal(manifest.schema, 1);
  assert.deepEqual(manifest.boundary, HOP4_BOUNDARY);
  assert.equal(manifest.sourceDigest, sha(JSON.stringify(manifest.sources)));
  assert.equal(manifest.artifactDigest, sha(JSON.stringify(manifest.artifacts)));
  for (const pin of [manifest.normal, ...manifest.sources, ...manifest.artifacts])
    assert.equal(sha(readFileSync(pin.path)), pin.sha256, `Changed input: ${pin.path}`);
  for (const variant of ['plain', 'control', 'instrumented'])
    assert(
      manifest.artifacts.some((f) => f.path === manifest.entries[variant]),
      `Missing ${variant} entry`
    );
  verifyArtifacts(manifest.normal.path, { expectedManifestSha256: manifest.normal.sha256 });
  return manifest;
}
function recordsOf(input) {
  const records =
    typeof input === 'string'
      ? readFileSync(input, 'utf8')
          .trim()
          .split('\n')
          .map((s) => JSON.parse(s))
      : input;
  assert(Array.isArray(records) && records.length > 0, 'Missing records');
  return records.map((r, index) => {
    assert.equal(r.index ?? index, index, 'Record order/identity changed');
    assert.equal(typeof r.source, 'string');
    assert.equal(r.sourceSha256, sha(r.source), 'Source hash mismatch');
    return { ...r, index };
  });
}
function freshDirectory(out) {
  out = resolve(out);
  requirePrivate(resolve(out, 'result.json'));
  assert(!existsSync(out), 'Fresh private output directory required');
  mkdirSync(out, { recursive: true });
  return out;
}
async function loadEntries(manifest) {
  const result = {};
  for (const [variant, path] of Object.entries(manifest.entries))
    result[variant] = await import(pathToFileURL(path));
  return result;
}
export async function verifyHop4Equality({ manifest, records, out }) {
  const built = verifyHop4Artifacts(manifest);
  const entries = await loadEntries(built);
  const normalManifest = readJson(built.normal.path);
  const normal = await import(pathToFileURL(normalManifest.entries.v13.timing.entry));
  const resetProof = await (
    await import(pathToFileURL(normalManifest.entries.v13.diagnostic.entry))
  ).verifyReset();
  const selected = recordsOf(records);
  out = freshDirectory(out);
  const raw = resolve(out, 'equality.jsonl');
  writeFileSync(raw, '', { flag: 'wx' });
  for (const r of selected) {
    const results = {};
    for (const [variant, entry] of Object.entries({ normal, ...entries })) {
      await entry.setup(r.source);
      entry.reset();
      entry.resetHop4?.(true);
      const svg = entry.render(r.source, r.index);
      results[variant] = { svg, stats: entry.hop4Stats?.() };
    }
    for (const variant of ['plain', 'control', 'instrumented'])
      assert.equal(results[variant].svg, results.normal.svg, `SVG mismatch ${r.index}/${variant}`);
    const a = results.control.stats,
      b = results.instrumented.stats;
    assert(a.calls >= 1 && a.finalModels.length === 1, `Missing conversion ${r.index}`);
    assert.equal(a.calls, b.calls);
    assert.deepEqual(a.models, b.models, `Conversion model mismatch ${r.index}`);
    assert.deepEqual(a.finalModels, b.finalModels, `Final layout mismatch ${r.index}`);
    assert.equal(b.durations.length, b.calls);
    appendFileSync(
      raw,
      JSON.stringify({
        index: r.index,
        sourceSha256: r.sourceSha256,
        svgSha256: sha(results.normal.svg),
        calls: a.calls,
        conversionModelsSha256: sha(serialize(a.models)),
        finalModelsSha256: sha(serialize(a.finalModels)),
        identical: true,
      }) + '\n'
    );
  }
  verifyHop4Artifacts(manifest);
  const result = {
    complete: true,
    purpose: 'untimed equality; not performance evidence',
    records: selected.length,
    resetProof,
    sample: typeof records === 'string' ? filePin(records) : null,
    sourceDigest: built.sourceDigest,
    manifestSha256:
      typeof manifest === 'string' ? sha(readFileSync(manifest)) : sha(JSON.stringify(manifest)),
    sourceHashesSha256: sha(JSON.stringify(selected.map((r) => r.sourceSha256))),
    artifactDigest: built.artifactDigest,
    raw: filePin(raw),
    boundary: HOP4_BOUNDARY,
  };
  immutableJson(resolve(out, 'result.json'), result);
  return result;
}

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
export function distribution(values) {
  assert(
    values.length > 0 && values.every((v) => Number.isFinite(v) && v >= 0),
    'Invalid diagnostic values'
  );
  const med = median(values),
    min = Math.min(...values),
    max = Math.max(...values);
  return {
    median: med,
    min,
    max,
    range: max - min,
    relativeRange: med > 0 ? (max - min) / med : null,
  };
}
function validateRows(rows, selected, policy) {
  assert.equal(rows.length, selected.length, 'Record coverage mismatch');
  rows.forEach((row, index) => {
    const r = selected[index];
    assert.equal(row.index, index, 'Record order mismatch');
    assert.equal(row.sourceSha256, r.sourceSha256, 'Record source identity mismatch');
    assert.equal(row.sourceBytes, Buffer.byteLength(r.source));
    assert.equal(row.bucket, bucketFor(row.sourceBytes, policy));
    assert.equal(row.replicates.length, 7, 'Seven repetitions required');
    let calls;
    for (const [repetition, rep] of row.replicates.entries()) {
      assert.equal(rep.repetition, repetition);
      assert.equal(rep.order, (index + repetition) % 2 ? 'IP' : 'PI');
      assert(Number.isSafeInteger(rep.calls) && rep.calls > 0, 'Missing conversion');
      calls ??= rep.calls;
      assert.equal(rep.calls, calls, 'Conversion pass count changed');
      assert.equal(rep.clockReads, 2 * rep.calls);
      assert.equal(rep.hopUs.length, rep.calls);
      assert(rep.hopUs.every((n) => Number.isFinite(n) && n >= 0));
      assert(rep.plainTotalUs > 0 && Number.isFinite(rep.plainTotalUs));
      assert(rep.instrumentedTotalUs > 0 && Number.isFinite(rep.instrumentedTotalUs));
      assert(
        rep.hopUs.reduce((n, v) => n + v, 0) <= rep.instrumentedTotalUs,
        'Conversion exceeds render'
      );
    }
  });
}
export function summarizeHop4({ rows, records, policy }) {
  const selected = recordsOf(records);
  validateRows(rows, selected, policy);
  const groups = [
    { name: 'all', rows },
    ...policy.buckets.map((b) => ({ name: b.name, rows: rows.filter((r) => r.bucket === b.name) })),
  ];
  const sum = (values) => values.reduce((a, b) => a + b, 0);
  return groups.map(({ name, rows: group }) => {
    if (!group.length) return { bucket: name, records: 0 };
    const hop = (row) => row.replicates.map((r) => sum(r.hopUs));
    const total = (row, key) => row.replicates.map((r) => r[key]);
    const hopSum = sum(group.map((r) => median(hop(r))));
    const instrumentedSum = sum(group.map((r) => median(total(r, 'instrumentedTotalUs'))));
    const plainSum = sum(group.map((r) => median(total(r, 'plainTotalUs'))));
    return {
      bucket: name,
      records: group.length,
      conversionPassesPerRenderSum: sum(group.map((r) => r.replicates[0].calls)),
      sumPerRecordMedianHopUs: hopSum,
      sumPerRecordMedianInstrumentedTotalUs: instrumentedSum,
      sumPerRecordMedianPlainTotalUs: plainSum,
      hopFractionOfInstrumented: hopSum / instrumentedSum,
      instrumentedToPlainTotalRatio: instrumentedSum / plainSum,
      perRecordMedianHopUs: distribution(group.map((r) => median(hop(r)))),
      perRecordHopRangeUs: distribution(group.map((r) => distribution(hop(r)).range)),
      replicateHopSumsUs: Array.from({ length: 7 }, (_, i) => sum(group.map((r) => hop(r)[i]))),
      replicateHopSumSpreadUs: distribution(
        Array.from({ length: 7 }, (_, i) => sum(group.map((r) => hop(r)[i])))
      ),
    };
  });
}

// Each collection gets a fresh renderer thread. Parent timers can interrupt synchronous hangs.
export function collectHop4(options) {
  return new Promise((done, fail) => {
    const worker = new Worker(new URL(import.meta.url), {
      workerData: { hop4Collect: true, options },
    });
    let timer, result;
    const abort = (error) => {
      clearTimeout(timer);
      void worker.terminate();
      fail(error);
    };
    worker.on('message', (message) => {
      if (message.type === 'watchdog') {
        clearTimeout(timer);
        if (message.operation)
          timer = setTimeout(
            () => abort(new Error(`Hop-4 timeout: ${message.operation}`)),
            options.policy.timing.renderTimeoutMs
          );
      } else if (message.type === 'result') result = message.result;
    });
    worker.once('error', abort);
    worker.once('exit', (code) => {
      clearTimeout(timer);
      if (code !== 0 || !result) fail(new Error(`Hop-4 child incomplete: ${code}`));
      else done(result);
    });
  });
}
function watchdog(operation) {
  parentPort.postMessage({ type: 'watchdog', operation });
}
async function collectInThread({ manifest, records, policy, out }) {
  assert.equal(process.version, 'v24.16.0');
  assert.equal(process.versions.v8, '13.6.233.17-node.49');
  assert(!process.env.NODE_OPTIONS && process.execArgv.length === 0, 'Plain pinned Node required');
  const policyPath = resolve(root, 'v13/docs/perf/POLICY.json');
  assert.deepEqual(policy, readJson(policyPath), 'Frozen policy required');
  assert.equal(policy.diagnostics.warmups, 3);
  assert.equal(policy.diagnostics.repetitions, 7);
  assert.equal(typeof records, 'string', 'Formal collection requires pinned sample file');
  assert.equal(sha(readFileSync(records)), SAMPLE, 'Frozen sample required');
  const selected = recordsOf(records);
  assert.equal(selected.length, 5000);
  const built = verifyHop4Artifacts(manifest);
  const entries = await loadEntries(built);
  out = freshDirectory(out);
  const raw = resolve(out, 'hop4.jsonl');
  writeFileSync(raw, '', { flag: 'wx' });
  const clockControls = [];
  const clockControl = (phase) => {
    const pairsUs = Array.from({ length: 10000 }, () => entries.instrumented.clockPair());
    clockControls.push({ phase, pairsUs, summaryUs: distribution(pairsUs) });
  };
  for (let i = 0; i < 1000; i++) entries.instrumented.clockPair();
  clockControl('before');
  const rows = [];
  for (const r of selected) {
    for (const variant of ['plain', 'instrumented']) {
      const entry = entries[variant];
      watchdog(`${variant}.setup[${r.index}]`);
      await entry.setup(r.source);
      watchdog(null);
      for (let i = 0; i < 3; i++) {
        entry.reset();
        entry.resetHop4(false);
        watchdog(`${variant}.warmup[${r.index}]`);
        entry.render(r.source, r.index);
        watchdog(null);
      }
    }
    const row = {
      index: r.index,
      sourceSha256: r.sourceSha256,
      sourceBytes: Buffer.byteLength(r.source),
      bucket: bucketFor(Buffer.byteLength(r.source), policy),
      replicates: [],
    };
    for (let repetition = 0; repetition < 7; repetition++) {
      const order =
        (r.index + repetition) % 2 ? ['instrumented', 'plain'] : ['plain', 'instrumented'];
      const rep = { repetition, order: order[0] === 'plain' ? 'PI' : 'IP' };
      let firstSvg;
      for (const variant of order) {
        const entry = entries[variant];
        entry.reset();
        entry.resetHop4(false);
        watchdog(`${variant}.render[${r.index}]`);
        const start = performance.now();
        const svg = entry.render(r.source, r.index);
        rep[variant + 'TotalUs'] = (performance.now() - start) * 1000;
        watchdog(null);
        assert(svg.startsWith('<svg'), 'Invalid SVG');
        if (firstSvg !== undefined) assert.equal(svg, firstSvg, `Output changed at ${r.index}`);
        firstSvg = svg;
        if (variant === 'instrumented') {
          const stats = entry.hop4Stats();
          assert.equal(stats.models.length, 0, 'Capture enabled inside timing');
          assert.equal(stats.finalModels.length, 0);
          rep.calls = stats.calls;
          rep.clockReads = 2 * stats.calls;
          rep.hopUs = [...stats.durations];
        }
      }
      row.replicates.push(rep);
    }
    rows.push(row);
    appendFileSync(raw, JSON.stringify(row) + '\n');
    if (r.index % 100 === 0) process.stderr.write(`PERF_PROGRESS hop4 ${r.index}\n`);
  }
  clockControl('after');
  verifyHop4Artifacts(manifest);
  assert.equal(sha(readFileSync(records)), SAMPLE);
  assert.deepEqual(policy, readJson(policyPath));
  const controlsPath = resolve(out, 'clock-controls.json');
  immutableJson(controlsPath, clockControls);
  const result = {
    schema: 1,
    complete: true,
    purpose: 'hop4-diagnostic-only',
    timingEligible: false,
    records: rows.length,
    sample: filePin(records),
    policySha256: sha(readFileSync(policyPath)),
    policy,
    manifestSha256:
      typeof manifest === 'string' ? sha(readFileSync(manifest)) : sha(JSON.stringify(manifest)),
    artifactDigest: built.artifactDigest,
    sourceDigest: built.sourceDigest,
    sourceHashesSha256: sha(JSON.stringify(selected.map((r) => r.sourceSha256))),
    node: process.version,
    v8: process.versions.v8,
    boundary: HOP4_BOUNDARY,
    limitations: HOP4_LIMITATIONS,
    warmups: 3,
    repetitions: 7,
    cache: 'Reset analysis and text width caches outside each render; unchanged source.',
    aggregate: summarizeHop4({ rows, records: selected, policy }),
    clockControls: clockControls.map(({ phase, summaryUs }) => ({
      phase,
      pairs: 10000,
      summaryUs,
    })),
    evidence: [filePin(raw), filePin(controlsPath)],
  };
  immutableJson(resolve(out, 'result.json'), result);
  immutableJson(resolve(out, 'evidence-tree.json'), {
    files: [...result.evidence, filePin(resolve(out, 'result.json'))],
  });
  return result;
}

if (workerData?.hop4Collect) {
  const result = await collectInThread(workerData.options);
  parentPort.postMessage({ type: 'result', result });
}

/** Recompute summaries from pinned raw evidence; scheduler/acceptance eligibility is caller-owned. */
export function validateHop4Report({ result, manifest, records, policy }) {
  const built = verifyHop4Artifacts(manifest);
  assert.equal(result.complete, true);
  assert.equal(result.purpose, 'hop4-diagnostic-only');
  assert.equal(result.timingEligible, false);
  assert.equal(result.node, 'v24.16.0');
  assert.equal(result.v8, '13.6.233.17-node.49');
  assert.equal(result.warmups, 3);
  assert.equal(result.repetitions, 7);
  assert.equal(result.records, 5000);
  assert.deepEqual(result.boundary, HOP4_BOUNDARY);
  assert.deepEqual(result.limitations, HOP4_LIMITATIONS);
  assert.deepEqual(policy, readJson(resolve(root, 'v13/docs/perf/POLICY.json')));
  assert.deepEqual(result.policy, policy);
  assert.equal(result.policySha256, sha(readFileSync(resolve(root, 'v13/docs/perf/POLICY.json'))));
  assert.equal(typeof records, 'string');
  assert.equal(sha(readFileSync(records)), SAMPLE);
  assert.deepEqual(result.sample, filePin(records));
  assert.equal(result.artifactDigest, built.artifactDigest);
  assert.equal(result.sourceDigest, built.sourceDigest);
  assert.equal(
    result.manifestSha256,
    typeof manifest === 'string' ? sha(readFileSync(manifest)) : sha(JSON.stringify(manifest))
  );
  const selected = recordsOf(records);
  assert.equal(selected.length, 5000);
  assert.equal(result.sourceHashesSha256, sha(JSON.stringify(selected.map((r) => r.sourceSha256))));
  assert.equal(result.evidence.length, 2);
  for (const pin of result.evidence) assert.deepEqual(pin, filePin(pin.path));
  const raw = result.evidence.find((p) => basename(p.path) === 'hop4.jsonl');
  const controls = result.evidence.find((p) => basename(p.path) === 'clock-controls.json');
  assert(raw && controls, 'Incomplete raw evidence');
  const rows = readFileSync(raw.path, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.deepEqual(result.aggregate, summarizeHop4({ rows, records: selected, policy }));
  const clock = readJson(controls.path);
  assert.deepEqual(
    clock.map((c) => c.phase),
    ['before', 'after']
  );
  for (const c of clock) {
    assert.equal(c.pairsUs.length, 10000);
    assert.deepEqual(c.summaryUs, distribution(c.pairsUs));
  }
  assert.deepEqual(
    result.clockControls,
    clock.map(({ phase, summaryUs }) => ({ phase, pairs: 10000, summaryUs }))
  );
  return {
    valid: true,
    timingEligible: false,
    records: selected.length,
    aggregate: result.aggregate,
  };
}
