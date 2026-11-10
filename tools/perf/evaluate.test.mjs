import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, POLICY, policySha256, digest, PIN_KEYS, median } from './evaluate.mjs';
import { envelope } from './gates.mjs';
import { canonical } from './scheduler.mjs';
const h = digest('fixture');
function attest(bundle, { timingOnly = false } = {}) {
  function proof(records, noiseBlock) {
    const pins = noiseBlock === undefined ? bundle.pins : bundle.noise.referencePins;
    const id = noiseBlock === undefined ? 'candidate' : `aa-${noiseBlock}`;
    const path = `/synthetic/${id}/result.json`;
    const raw =
      JSON.stringify({
        completed: true,
        contaminated: false,
        timingEligible: true,
        mode: 'formal',
        policy: POLICY,
        pins,
        records,
        experiment: noiseBlock === undefined ? 'candidate' : 'aa',
        block: noiseBlock,
        comparison: {
          base: 'v13',
          head: 'v13',
          baseCache: 'off',
          headCache: 'off',
          sourceMutation: 'none',
        },
      }) + '\n';
    const queue = {
      identity: { pins },
      jobs: [{ id, outputs: [path] }],
      mode: 'formal',
      quietPolicy: POLICY.quiet,
    };
    const activity = {
      busy: false,
      totalCpuMs: 0,
      offenders: [],
      intervalMs: 1000,
      load: [0, 0, 0],
    };
    return {
      queue,
      output: { path, raw },
      receipt: {
        id,
        attempt: `test-${id}`,
        event: 'complete',
        completed: true,
        contaminated: false,
        mode: 'formal',
        timingEligible: true,
        identitySha256: digest(canonical(queue)),
        outputs: [{ path, sha256: digest(raw) }],
        quiet: { startup: [activity, activity, activity], monitoring: [activity] },
      },
    };
  }
  bundle.timing.measurement = proof(bundle.timing.records);
  if (!timingOnly)
    for (const [block, estimate] of bundle.noise.estimates.entries())
      estimate.measurement = proof(estimate.records, block);
  return bundle;
}
function fixture() {
  const indices = Array.from({ length: 500 }, (_, i) => i * 10);
  const browserSubsetRaw = JSON.stringify(indices);
  const browserPin = {
    version: 'synthetic',
    executablePath: '/synthetic/browser',
    executableSha256: h,
    fonts: [{ path: '/synthetic/font.ttf', sha256: h }],
    os: { platform: 'darwin', release: 'synthetic' },
    settings: POLICY.browser,
  };
  const pins = Object.fromEntries(PIN_KEYS.map((k) => [k, h]));
  pins.policySha256 = policySha256;
  pins.browserSubsetSha256 = digest(browserSubsetRaw);
  const wrap = (kind, data) => envelope(kind, pins, 'formal', data);
  const rows = (ratio) =>
    Array.from({ length: 5000 }, (_, index) => ({
      index,
      sourceBytes: [100, 2000, 8000, 20000][index % 4],
      base: Array(7).fill(100),
      head: Array(7).fill(100 * ratio),
    }));
  const bundle = {
    policy: POLICY,
    pins,
    browserIndices: indices,
    browserSubsetRaw,
    browserPin,
    timing: wrap('timing', { contaminated: false, records: rows(0.98) }),
    noise: wrap('noise', {
      contaminated: false,
      referencePins: { ...pins },
      estimates: Array.from({ length: 10 }, () => ({ records: rows(1.001) })),
    }),
    bytes: wrap('bytes', {
      records: rows(1).map(({ index }) => ({
        index,
        baseSha256: h,
        headSha256: h,
        baseBytes: 100,
        headBytes: 100,
      })),
    }),
    surface: wrap('surface', {
      records: rows(1).map(({ index }) => ({ index, baseSha256: h, headSha256: h, equal: true })),
    }),
    pixels: wrap('pixels', {
      browserPinSha256: digest(JSON.stringify(browserPin)),
      indicesSha256: digest(JSON.stringify(indices)),
      records: indices.map((index) => ({ index, baseSha256: h, headSha256: h, equal: true })),
    }),
    checks: wrap('checks', {
      results: ['check', 'security', 'e2e'].map((name) => ({
        name,
        command: `pnpm ${name}`,
        exitCode: 0,
        logSha256: h,
      })),
    }),
    size: wrap('size', { passed: true, command: 'size-budget', exitCode: 0, logSha256: h }),
  };
  return attest(bundle);
}
test('deterministic fit, fixed estimator, independent requirement approval', () => {
  const bundle = fixture();
  assert.deepEqual(evaluate(bundle), evaluate(structuredClone(bundle)));
  assert.equal(evaluate(bundle).verdict, 'fit');
  bundle.requirementAmendment = { required: true, approved: false };
  assert.equal(evaluate(bundle).delivery, 'awaiting-approval');
  assert.equal(median([1, 100, 3]), 3);
});
test('deliberately slowed candidate fails overall and bucket rules', () => {
  const bundle = fixture();
  for (const row of bundle.timing.records) row.head = Array(7).fill(110);
  attest(bundle, { timingOnly: true });
  const result = evaluate(bundle);
  assert.equal(result.verdict, 'unfit');
  assert(result.reasons.some((r) => r.includes('bucket')));
});
test('protected ID-only surface change fails even when byte evidence claims identity', () => {
  const bundle = fixture();
  Object.assign(bundle.surface.records[0], { equal: false, headSha256: digest('changed ID') });
  assert.equal(evaluate(bundle).verdict, 'unfit');
});
test('one pixel difference fails output lane', () => {
  const bundle = fixture();
  bundle.bytes.records[0].headSha256 = digest('different encoding');
  Object.assign(bundle.pixels.records[0], {
    equal: false,
    headSha256: digest('one changed pixel'),
  });
  assert.equal(evaluate(bundle).verdict, 'unfit');
});
test('missing or stale security/check/size/raw evidence blocks fit', () => {
  for (const key of ['timing', 'noise', 'bytes', 'surface', 'checks', 'size']) {
    const bundle = fixture();
    delete bundle[key];
    assert.equal(evaluate(bundle).verdict, 'blocked', key);
  }
  for (const name of ['security', 'check']) {
    const bundle = fixture();
    bundle.checks.results = bundle.checks.results.filter((r) => r.name !== name);
    assert.equal(evaluate(bundle).verdict, 'blocked', name);
  }
  const bundle = fixture();
  bundle.size.pins = { ...bundle.pins, headSourceSha256: digest('other source') };
  assert.equal(evaluate(bundle).verdict, 'blocked');
});
test('rehearsals, contamination, duplicate records and partial repetitions cannot fit', () => {
  for (const change of [
    (b) => (b.timing.scope = 'rehearsal'),
    (b) => (b.timing.contaminated = true),
    (b) => (b.timing.records[0].index = 1),
    (b) => b.timing.records[0].head.pop(),
  ]) {
    const bundle = fixture();
    change(bundle);
    assert.equal(evaluate(bundle).verdict, 'blocked');
  }
});
test('5% fewer bytes with flat Node time passes; >1% bucket regression still fails', () => {
  const bundle = fixture();
  for (const row of bundle.bytes.records) {
    row.headSha256 = digest('lean');
    row.headBytes = 95;
  }
  for (const row of bundle.timing.records) row.head = Array(7).fill(100);
  attest(bundle, { timingOnly: true });
  assert.equal(evaluate(bundle).verdict, 'fit');
  for (const row of bundle.timing.records)
    if (row.sourceBytes === 100) row.head = Array(7).fill(102);
  attest(bundle, { timingOnly: true });
  assert.equal(evaluate(bundle).verdict, 'unfit');
});
test('output lane requires every fixed pixel index and the pinned raw subset', () => {
  for (const change of [
    (b) => b.pixels.records.pop(),
    (b) => (b.pixels.records[0].index = 1),
    (b) => (b.browserSubsetRaw += ' '),
    (b) => delete b.browserPin,
  ]) {
    const bundle = fixture();
    bundle.bytes.records[0].headSha256 = digest('encoding');
    change(bundle);
    assert.equal(evaluate(bundle).verdict, 'blocked');
  }
});

test('worker flags without scheduler receipts or monitored samples cannot fit', () => {
  for (const change of [
    (bundle) => delete bundle.timing.measurement,
    (bundle) => delete bundle.noise.estimates[0].measurement,
    (bundle) => delete bundle.timing.measurement.receipt,
    (bundle) => (bundle.timing.measurement.receipt.quiet.monitoring = []),
    (bundle) => (bundle.timing.measurement.receipt.quiet.startup = []),
  ]) {
    const bundle = fixture();
    change(bundle);
    assert.equal(evaluate(bundle).verdict, 'blocked');
  }
});
test('scheduler receipts bind exact raw bytes and the timing rows evaluated', () => {
  for (const change of [
    (bundle) => (bundle.timing.measurement.output.raw += ' '),
    (bundle) => (bundle.timing.records[0].head[0] = 1),
    (bundle) => (bundle.noise.estimates[0].measurement.output.raw += ' '),
    (bundle) =>
      (bundle.timing.measurement.queue.identity.pins.headSourceSha256 = digest('other-source')),
  ]) {
    const bundle = fixture();
    change(bundle);
    assert.equal(evaluate(bundle).verdict, 'blocked');
  }
});
test('contaminated scheduler receipts and dishonest clean flags fail closed', () => {
  for (const change of [
    (bundle) => (bundle.timing.measurement.receipt.contaminated = true),
    (bundle) => (bundle.noise.estimates[0].measurement.receipt.contaminated = true),
    (bundle) => (bundle.timing.measurement.receipt.quiet.monitoring[0].busy = true),
    (bundle) => (bundle.timing.measurement.receipt.quiet.monitoring[0].totalCpuMs = 25),
    (bundle) => (bundle.timing.measurement.receipt.mode = 'rehearsal'),
  ]) {
    const bundle = fixture();
    change(bundle);
    assert.equal(evaluate(bundle).verdict, 'blocked');
  }
});

test('later candidate bases retain the original frozen A/A source identity and reject relabeling', () => {
  const bundle = fixture();
  const reference = structuredClone(bundle.noise.referencePins);
  bundle.pins.baseSourceSha256 = digest('later-base-source');
  bundle.pins.baseArtifactSha256 = digest('later-base-artifact');
  bundle.pins.headSourceSha256 = digest('later-head-source');
  bundle.pins.headArtifactSha256 = digest('later-head-artifact');
  attest(bundle, { timingOnly: true });
  assert.deepEqual(bundle.noise.referencePins, reference);
  assert.equal(evaluate(bundle).verdict, 'fit');
  for (const key of ['sampleSha256', 'browserSubsetSha256', 'policySha256']) {
    const changed = structuredClone(bundle);
    changed.noise.referencePins[key] = digest('relabeled');
    assert.equal(evaluate(changed).verdict, 'blocked');
  }
});
