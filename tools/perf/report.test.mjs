/** Synthetic complete evidence exercises report validation; no renderer or formal timing runs. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { report } from './round.mjs';
import { canonical } from './scheduler.mjs';
import { POLICY, policySha256, digest, PIN_KEYS } from './evaluate.mjs';
import { envelope } from './gates.mjs';

function fixture(t, mutate = (raw) => raw, profile = 'full') {
  const directory = mkdtempSync(resolve(tmpdir(), 'perf-report-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const json = (path, value) => {
    mkdirSync(resolve(path, '..'), { recursive: true });
    writeFileSync(path, JSON.stringify(value) + '\n');
  };
  const file = (name) => resolve(directory, name);
  const source = 'graph TD\nA --> B';
  const sourceSha256 = digest(source);
  const sample = Array.from({ length: 5000 }, () => ({ source, sourceSha256 }));
  writeFileSync(file('sample.jsonl'), sample.map((row) => JSON.stringify(row)).join('\n') + '\n');
  const subset = Array.from({ length: 500 }, (_, index) => index * 10);
  json(file('subset.json'), subset);
  const h = digest('synthetic evidence');
  const pins = Object.fromEntries(PIN_KEYS.map((key) => [key, h]));
  Object.assign(pins, {
    sampleSha256: digest(readFileSync(file('sample.jsonl'))),
    browserSubsetSha256: digest(readFileSync(file('subset.json'))),
    policySha256,
  });
  const wrap = (kind, data) => envelope(kind, pins, 'formal', data);
  const rows = sample.map((_, index) => ({
    index,
    sourceSha256,
    sourceBytes: Buffer.byteLength(source),
    bucket: 'tiny',
    base: Array(7).fill(100),
    head: Array(7).fill(100),
  }));
  const timing = {
    completed: true,
    contaminated: false,
    timingEligible: true,
    policy: POLICY,
    records: rows,
  };
  const equal = (indices) =>
    indices.map((index) => ({
      index,
      baseSha256: h,
      headSha256: h,
      equal: true,
      baseBytes: 100,
      headBytes: 100,
    }));
  const browserPin = {
    version: 'synthetic',
    executablePath: '/synthetic/browser',
    executableSha256: h,
    fonts: [{ path: '/synthetic/font.ttf', sha256: h }],
    os: { platform: 'darwin', release: 'synthetic' },
    settings: POLICY.browser,
  };
  const renderer = {
    totals: { outputBytes: 100, elements: 10, attributes: 10, measurerCalls: 10 },
    allocatedBytesEstimate: 100,
    allocationError: { maximumCalibrationRelativeError: 0.1 },
    gc: {
      scavengePauseMsPerPass: 0,
      renders: [{ index: 0, privateMarker: 'PRIVATE_RECORD_SENTINEL' }],
    },
  };
  const features = Object.fromEntries(
    [
      'frontMatter',
      'initDirectives',
      'themeVariables',
      'shapeData',
      'subgraphs',
      'comments',
      'wideLabels',
      'labelledEdges',
    ].map((key) => [key, 0])
  );
  const raw = Object.fromEntries(
    Array.from({ length: 10 }, (_, index) => [`aa-${index}`, structuredClone(timing)])
  );
  Object.assign(raw, {
    pele: structuredClone(timing),
    'trailing-comment': structuredClone(timing),
    cache: structuredClone(timing),
    gates: {
      bytes: wrap('bytes', { records: equal(rows.map((row) => row.index)) }),
      surface: wrap('surface', { records: equal(rows.map((row) => row.index)) }),
    },
    browser: {
      browserPin,
      pixels: wrap('pixels', {
        indicesSha256: digest(JSON.stringify(subset)),
        browserPinSha256: digest(JSON.stringify(browserPin)),
        records: equal(subset),
      }),
      metrics: {
        method: 'synthetic test',
        records: ['base', 'head', 'pele'].flatMap((kind) =>
          subset.map((index) => ({ index, kind, renderMs: 1, insertMs: 1, getBBoxMs: 1 }))
        ),
      },
    },
    diagnostics: {
      complete: true,
      records: 5000,
      artifactDigest: pins.baseArtifactSha256,
      sourceHashesSha256: digest(JSON.stringify(sample.map((row) => row.sourceSha256))),
      policy: POLICY,
      methods: Object.fromEntries(
        ['allocations', 'scavenge', 'traceAllocation', 'markup', 'features', 'stages'].map(
          (key) => [key, 'synthetic test']
        )
      ),
      renderers: { v13: renderer, pele: renderer },
      features: { occurrences: features, diagrams: features },
      emptyGraph: {
        medianMs: Object.fromEntries(
          ['total', 'parse', 'layout', 'serialise', 'measure', 'graphLayout', 'unaccounted'].map(
            (key) => [key, 1]
          )
        ),
      },
    },
  });
  for (const value of Object.values(raw)) Object.assign(value, { scope: 'formal', pins });
  if (profile === 'node') delete raw.browser;
  mutate(raw);
  const acceptanceResults = [
    'environment',
    'harness',
    'check',
    'security',
    'size',
    'host',
    'browser',
    'e2e',
  ]
    .filter((name) => profile === 'full' || !['browser', 'e2e'].includes(name))
    .map((name) => {
      const log = file(`${name}.log`);
      writeFileSync(log, 'synthetic test evidence');
      return { name, status: 'passed', exitCode: 0, log, logSha256: digest(readFileSync(log)) };
    });
  json(file('acceptance.json'), {
    validationProfile: profile,
    ready: true,
    sourceStable: true,
    sourceSha256: h,
    results: acceptanceResults,
  });
  json(file('manifest.json'), { source: { commit: 'synthetic-test' } });
  const header = {
    mode: 'formal',
    validationProfile: profile,
    policy: POLICY,
    pins,
    source: { sha256: h },
    manifest: file('manifest.json'),
    manifestSha256: digest(readFileSync(file('manifest.json'))),
    sample: { sample: file('sample.jsonl'), subset: file('subset.json') },
    acceptance: {
      path: file('acceptance.json'),
      sha256: digest(readFileSync(file('acceptance.json'))),
    },
    browserPin: profile === 'full' ? browserPin : null,
  };
  json(file('header.json'), header);
  const jobs = Object.entries(raw).map(([id, value]) => {
    const path = file(`${id}/result.json`);
    json(path, value);
    const treePath = file(`${id}/evidence-tree.json`);
    json(treePath, { files: [{ path, sha256: digest(readFileSync(path)) }] });
    return { id, outputs: [path, treePath], outputTrees: [treePath] };
  });
  const queue = {
    directory,
    identity: { headerSha256: digest(readFileSync(file('header.json'))), pins },
    mode: 'formal',
    quietPolicy: POLICY.quiet,
    jobs,
  };
  json(file('queue.json'), queue);
  const frozen = canonical({
    identity: queue.identity,
    jobs,
    mode: 'formal',
    quietPolicy: queue.quietPolicy,
  });
  writeFileSync(file('queue-identity.json'), frozen);
  json(file('completion.json'), {
    completed: true,
    mode: 'formal',
    results: jobs.map((job) => ({
      id: job.id,
      completed: true,
      mode: 'formal',
      contaminated: false,
      timingEligible: true,
      identitySha256: digest(frozen),
      outputs: job.outputs.map((path) => ({ path, sha256: digest(readFileSync(path)) })),
    })),
  });
  return { directory, file, destination: file('published') };
}

test('report reproducibly emits aggregates and excludes GC per-record evidence', (t) => {
  const f = fixture(t);
  const first = report(f.directory, f.destination);
  const second = report(f.directory, f.destination);
  assert.deepEqual(first, second);
  assert.equal(first.summedV13OverPele, 1);
  assert(
    !readFileSync(resolve(f.destination, 'RESULTS.json'), 'utf8').includes(
      'PRIVATE_RECORD_SENTINEL'
    )
  );
  assert.equal(first.diagnostics.renderers.v13.gc.renders, undefined);
});
test('Node report needs no browser evidence and explicitly leaves browser validation unverified', (t) => {
  const f = fixture(t, undefined, 'node');
  const first = report(f.directory, f.destination);
  assert.deepEqual(first, report(f.directory, f.destination));
  assert.equal(first.validationProfile, 'node');
  assert.equal(first.browserValidation, 'unverified');
  assert.equal(first.browser, null);
  assert.equal(first.browserPin, null);
  assert.equal(first.summedV13OverPele, 1);
  assert.match(
    readFileSync(resolve(f.destination, 'REPORT.md'), 'utf8'),
    /Measurement environment: observed background activity \(P27\)/
  );
  assert.deepEqual(first.policy.backgroundLoad, POLICY.backgroundLoad);
  assert.match(
    readFileSync(resolve(f.destination, 'REPORT.md'), 'utf8'),
    /Browser validation is unverified/
  );
});
test('Node report still rejects missing byte/surface gates and failed equality', (t) => {
  for (const mutate of [
    (raw) => delete raw.gates,
    (raw) => delete raw.gates.bytes,
    (raw) => delete raw.gates.surface,
    (raw) => (raw.gates.bytes.records[0].headSha256 = digest('changed')),
    (raw) => (raw.gates.surface.records[0].equal = false),
  ]) {
    const f = fixture(t, mutate, 'node');
    assert.throws(() => report(f.directory, f.destination));
  }
});
test('full report cannot omit its browser experiment', (t) => {
  const f = fixture(t, (raw) => delete raw.browser);
  assert.throws(
    () => report(f.directory, f.destination),
    /Missing or unexpected formal experiments/
  );
});
test('report rejects missing experiment, duplicate sample and absent P7 evidence', (t) => {
  for (const mutate of [
    (raw) => delete raw['aa-9'],
    (raw) => (raw.pele.records[0].index = 1),
    (raw) => delete raw.diagnostics.renderers.v13.totals.measurerCalls,
  ]) {
    const f = fixture(t, mutate);
    assert.throws(() => report(f.directory, f.destination));
  }
});
test('report rejects failed byte, protected surface and pixel A/A gates', (t) => {
  for (const mutate of [
    (raw) => (raw.gates.bytes.records[0].headSha256 = digest('changed')),
    (raw) => (raw.gates.surface.records[0].equal = false),
    (raw) => (raw.browser.pixels.records[0].equal = false),
  ]) {
    const f = fixture(t, mutate);
    assert.throws(() => report(f.directory, f.destination), /Failed A\/A/);
  }
});
test('report rejects tampered raw files, header and frozen queue', (t) => {
  for (const path of ['pele/result.json', 'header.json', 'queue-identity.json']) {
    const f = fixture(t);
    writeFileSync(f.file(path), readFileSync(f.file(path), 'utf8') + ' ');
    assert.throws(() => report(f.directory, f.destination), /Changed|identity|changed/);
  }
});
