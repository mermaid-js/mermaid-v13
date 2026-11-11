/** Serial diagnostic passes, separate from timing acceptance. Record-level data stays private. */
import { spawn } from 'node:child_process';
import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { verifyArtifacts } from './build.mjs';
import { root, requirePrivate, sha } from './common.mjs';
import { allocationEstimate, parseGcTrace } from './diagnostic-methods.mjs';

const SAMPLING_INTERVAL = 16384;
const VALIDATION_REPETITIONS = 3;
const MAX_VALIDATION_ERROR = 0.1;
const worker = fileURLToPath(new URL('./allocation-worker.mjs', import.meta.url));
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const evidence = (path) => ({
  path: resolve(path),
  sha256: sha(readFileSync(path)),
  bytes: readFileSync(path).length,
});

export async function runDiagnosticChild(job, out, stem, timeoutMs) {
  const jobPath = resolve(out, `${stem}.job.json`);
  const result = resolve(out, `${stem}.json`);
  const stdout = resolve(out, `${stem}.stdout.log`);
  const stderr = resolve(out, `${stem}.stderr.log`);
  writeFileSync(jobPath, JSON.stringify({ ...job, result }) + '\n', { flag: 'wx' });
  const descriptors = [openSync(stdout, 'wx'), openSync(stderr, 'wx')];
  const args = ['--expose-gc', ...(job.mode === 'gc' ? ['--trace-gc-nvp'] : []), worker, jobPath];
  try {
    await new Promise((done, fail) => {
      const env = { ...process.env };
      delete env.NODE_OPTIONS;
      const processChild = spawn(process.execPath, args, {
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let timer,
        timedOut = false;
      const heartbeat = () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          timedOut = true;
          processChild.kill('SIGKILL');
        }, timeoutMs);
      };
      heartbeat();
      processChild.stdout.on('data', (bytes) => writeSync(descriptors[0], bytes));
      processChild.stderr.on('data', (bytes) => {
        writeSync(descriptors[1], bytes);
        if (bytes.toString().includes('PERF_PROGRESS')) heartbeat();
      });
      processChild.once('error', (error) => {
        clearTimeout(timer);
        fail(error);
      });
      processChild.once('close', (code, signal) => {
        clearTimeout(timer);
        if (timedOut || code !== 0)
          fail(
            new Error(
              `Diagnostic child ${stem} failed (${JSON.stringify({ timedOut, signal, code })}); see private stderr`
            )
          );
        else done();
      });
    });
  } finally {
    for (const descriptor of descriptors) closeSync(descriptor);
  }
  return {
    value: JSON.parse(readFileSync(result, 'utf8')),
    stdout,
    evidence: [jobPath, result, stdout, stderr].map(evidence),
  };
}

function normalRecords(input) {
  const records =
    typeof input === 'string'
      ? readFileSync(input, 'utf8')
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line))
      : input;
  if (!Array.isArray(records) || records.length === 0)
    throw new Error('Diagnostics require nonempty records');
  return records.map((record, index) => {
    if (typeof record.source !== 'string') throw new Error(`Missing source at ${index}`);
    const sourceSha256 = sha(record.source);
    if (record.sourceSha256 && record.sourceSha256 !== sourceSha256)
      throw new Error(`Record hash mismatch at ${index}`);
    return { ...record, index: record.index ?? index, sourceSha256 };
  });
}

export async function collectDiagnostics({ manifest, records, out, policy } = {}) {
  if (process.version !== 'v24.16.0' || process.versions.v8 !== '13.6.233.17-node.49')
    throw new Error('Pinned Node 24.16.0 / V8 13.6.233.17-node.49 required');
  const build = verifyArtifacts(manifest);
  const selectedPolicy =
    policy ?? JSON.parse(readFileSync(resolve(root, 'v13/docs/perf/POLICY.json'), 'utf8'));
  const { warmups, repetitions, emptyGraphRepetitions } = selectedPolicy.diagnostics;
  const timeoutMs = selectedPolicy.timing.renderTimeoutMs;
  for (const number of [warmups, repetitions, emptyGraphRepetitions, timeoutMs])
    if (!Number.isSafeInteger(number) || number < 1) throw new Error('Invalid diagnostics policy');
  const selected = normalRecords(records);
  out = resolve(out);
  requirePrivate(resolve(out, 'records.json'));
  if (existsSync(out)) throw new Error('Diagnostics require a fresh private output directory');
  mkdirSync(out, { recursive: true });
  const recordsPath = resolve(out, 'records.json');
  writeFileSync(recordsPath, JSON.stringify(selected) + '\n', { flag: 'wx' });
  const rawPath = resolve(out, 'counters.jsonl');
  writeFileSync(rawPath, '', { flag: 'wx' });
  const rawEvidence = [evidence(recordsPath)];
  const result = {
    schema: 1,
    purpose: 'diagnostics only; not timing acceptance',
    complete: false,
    node: process.version,
    v8: process.versions.v8,
    manifestSha256:
      typeof manifest === 'string' ? sha(readFileSync(manifest)) : sha(JSON.stringify(manifest)),
    artifactDigest: build.artifactDigest,
    sourceHashesSha256: sha(JSON.stringify(selected.map((record) => record.sourceSha256))),
    records: selected.length,
    policy: selectedPolicy,
    samplingInterval: SAMPLING_INTERVAL,
    methods: {
      measurerCalls:
        'Actual width-method invocations, including any width-cache hits. Vertical metrics invocations are excluded and reported separately when supplied by the renderer.',
      metricsCalls:
        'Optional actual vertical-metrics method invocations; available for v13, absent for Pele.',
      allocations:
        'V8 HeapProfiler.startSampling with collected minor/major objects included; sum selfSize below named allocationRender frame; median independent child estimates. Timing artifacts avoid diagnostic-counter allocations.',
      scavenge:
        'Pinned --trace-gc-nvp pause= with gc=s, only between synchronous render markers. Other GC, setup/reset pauses and final forced-boundary pause reported separately.',
      traceAllocation:
        'Supplemental sum of V8 allocated= over GC intervals through final forced boundary; byte-precise occupancy deltas, NOT exact gross allocation.',
      markup: 'UTF-8 Buffer.byteLength plus quote-aware XML start-tag and attribute counting.',
      features:
        'v13 preprocessing, parser/token model and actual label layout inspection; number of occurrences and number of diagrams containing each feature.',
      stages:
        'Diagnostic stage clock; layout includes nested measure and graphLayout. Unaccounted time = total minus parse/layout/serialise; instrumentation overhead remains.',
    },
    calibration: [],
    renderers: {},
    features: { occurrences: {}, diagrams: {} },
    rawEvidence,
    implementation: [
      fileURLToPath(import.meta.url),
      worker,
      fileURLToPath(new URL('./diagnostic-methods.mjs', import.meta.url)),
      fileURLToPath(new URL('./diagnostic-passes.mjs', import.meta.url)),
    ].map(evidence),
  };
  // Fail closed before accepting real diagnostic allocations if either dead/live retention
  // or the pinned estimator fails the independently known-payload exercise.
  for (const retain of [false, true])
    for (let repetition = 0; repetition < VALIDATION_REPETITIONS; repetition++) {
      const run = await runDiagnosticChild(
        { mode: 'validate', retain, samplingInterval: SAMPLING_INTERVAL },
        out,
        `calibration-${retain}-${repetition}`,
        timeoutMs
      );
      rawEvidence.push(...run.evidence);
      const estimate = allocationEstimate(run.value.profile, 'allocateKnown');
      const lower = run.value.expectedPayloadBytes,
        upper = run.value.expectedMaximumBytes;
      const relativeError =
        estimate.estimatedBytes < lower
          ? (lower - estimate.estimatedBytes) / lower
          : estimate.estimatedBytes > upper
            ? (estimate.estimatedBytes - upper) / upper
            : 0;
      result.calibration.push({
        retain,
        repetition,
        ...estimate,
        expectedPayloadBytes: lower,
        expectedMaximumBytes: upper,
        relativeError,
      });
      if (relativeError > MAX_VALIDATION_ERROR)
        throw new Error(
          `Allocation calibration exceeded ${MAX_VALIDATION_ERROR}: ${relativeError}`
        );
    }
  for (const kind of ['v13', 'pele']) {
    const counterRun = await runDiagnosticChild(
      {
        mode: 'counters',
        kind,
        entry: build.entries[kind].diagnostic.entry,
        records: recordsPath,
        warmups,
        repetitions,
      },
      out,
      `${kind}-counters`,
      timeoutMs
    );
    rawEvidence.push(...counterRun.evidence);
    const { resetVerification, rows } = counterRun.value;
    if (rows.length !== selected.length) throw new Error('Missing counter records');
    const totals = { outputBytes: 0, elements: 0, attributes: 0, measurerCalls: 0, parserCalls: 0 };
    if (rows.some((row) => Object.hasOwn(row.repetitions[0], 'metricsCalls')))
      totals.metricsCalls = 0;
    for (const row of rows) {
      for (const key of Object.keys(totals)) {
        if (!Number.isSafeInteger(row.repetitions[0][key]))
          throw new Error(`Missing counter value: ${key}`);
        totals[key] += row.repetitions[0][key];
      }
      if (kind === 'v13')
        for (const feature of [
          'frontMatter',
          'initDirectives',
          'themeVariables',
          'shapeData',
          'subgraphs',
          'comments',
          'wideLabels',
          'labelledEdges',
        ]) {
          const value = row.features[feature];
          if (!Number.isSafeInteger(value) || value < 0)
            throw new Error(`Missing feature counter: ${feature}`);
          result.features.occurrences[feature] =
            (result.features.occurrences[feature] ?? 0) + value;
          result.features.diagrams[feature] =
            (result.features.diagrams[feature] ?? 0) + Number(value > 0);
        }
      appendFileSync(rawPath, JSON.stringify(row) + '\n');
    }
    const estimates = [];
    for (let repetition = 0; repetition < repetitions; repetition++) {
      const run = await runDiagnosticChild(
        {
          mode: 'sample',
          entry: build.entries[kind].timing.entry,
          records: recordsPath,
          warmups,
          samplingInterval: SAMPLING_INTERVAL,
        },
        out,
        `${kind}-allocation-${repetition}`,
        timeoutMs
      );
      rawEvidence.push(...run.evidence);
      estimates.push(allocationEstimate(run.value.profile, 'allocationRender'));
    }
    const gc = await runDiagnosticChild(
      {
        mode: 'gc',
        entry: build.entries[kind].timing.entry,
        records: recordsPath,
        warmups,
        repetitions,
      },
      out,
      `${kind}-gc`,
      timeoutMs
    );
    rawEvidence.push(...gc.evidence);
    const trace = parseGcTrace(readFileSync(gc.stdout, 'utf8'));
    if (trace.renders.length !== selected.length * repetitions)
      throw new Error('Missing GC render evidence');
    const estimateValues = estimates.map((item) => item.estimatedBytes),
      allocatedBytesEstimate = median(estimateValues);
    result.renderers[kind] = {
      resetVerification,
      totals,
      allocatedBytesEstimate,
      allocationReplicates: estimates,
      allocationError: {
        maximumCalibrationRelativeError: Math.max(
          ...result.calibration.map((item) => item.relativeError)
        ),
        replicateRelativeRange:
          (Math.max(...estimateValues) - Math.min(...estimateValues)) / allocatedBytesEstimate,
        interpretation:
          'Empirical calibration error and replicate spread, not a general confidence bound. Excludes native/external buffers and allocations outside sampled renderer stacks.',
      },
      gc: {
        ...trace,
        scavengePauseMsPerPass: trace.scavengePauseMs / repetitions,
        otherGcPauseMsPerPass: trace.otherGcPauseMs / repetitions,
      },
    };
  }
  const emptyRun = await runDiagnosticChild(
    { mode: 'empty', entry: build.entries.v13.diagnostic.entry, warmups, emptyGraphRepetitions },
    out,
    'empty-graph',
    timeoutMs
  );
  rawEvidence.push(...emptyRun.evidence);
  if (emptyRun.value.rows.length !== emptyGraphRepetitions)
    throw new Error('Missing empty graph repetitions');
  const stagePath = resolve(out, 'empty-graph-stages.jsonl');
  writeFileSync(stagePath, '', { flag: 'wx' });
  const stages = {};
  for (const row of emptyRun.value.rows) {
    appendFileSync(stagePath, JSON.stringify(row) + '\n');
    for (const [key, value] of Object.entries({
      total: row.totalMs,
      unaccounted: row.unaccountedMs,
      ...Object.fromEntries(
        Object.entries(row.stages).map(([name, measurement]) => [name, measurement.ms])
      ),
    }))
      (stages[key] ??= []).push(value);
  }
  result.emptyGraph = {
    repetitions: emptyGraphRepetitions,
    medianMs: Object.fromEntries(
      Object.entries(stages).map(([name, values]) => [name, median(values)])
    ),
  };
  rawEvidence.push(evidence(rawPath), evidence(stagePath));
  verifyArtifacts(manifest);
  result.complete = true;
  const resultPath = resolve(out, 'result.json');
  writeFileSync(resultPath, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  return { ...result, resultEvidence: evidence(resultPath) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values } = parseArgs({
    options: {
      manifest: { type: 'string' },
      records: { type: 'string' },
      out: { type: 'string' },
      policy: { type: 'string' },
    },
  });
  if (!values.manifest || !values.records || !values.out)
    throw new Error('--manifest, --records and --out are required');
  const result = await collectDiagnostics({
    ...values,
    policy: values.policy ? JSON.parse(readFileSync(values.policy, 'utf8')) : undefined,
  });
  console.log(JSON.stringify({ complete: result.complete, resultEvidence: result.resultEvidence }));
}
