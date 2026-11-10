import test from 'node:test';
import assert from 'node:assert/strict';
import { measurePairs, bucketFor, median } from './timing-worker.mjs';
import { sha256 } from './scheduler.mjs';
const policy = {
  sampleCount: 2,
  timing: { warmups: 3, pairs: 7, renderTimeoutMs: 30000, aaBlocks: 10 },
  buckets: [
    { name: 'tiny', minBytes: 0, maxBytes: 1024 },
    { name: 'large', minBytes: 1024, maxBytes: null },
  ],
};
const records = ['graph TD\nA-->B', 'graph TD\nC-->D'].map((source) => ({
  source,
  sourceSha256: sha256(source),
}));
const manifest = {
  entries: {
    v13: { timing: { entry: '/fake/v13.mjs' } },
    pele: { timing: { entry: '/fake/pele.mjs' } },
  },
};
function fixture(experiment = 'aa') {
  const calls = [];
  let time = 0n;
  const loadEntry = async (path, side) => ({
    configure() {},
    async setup(source) {
      calls.push({ side, setup: source });
    },
    reset(options) {
      calls.push({ side, reset: options });
    },
    render(source, index) {
      calls.push({ side, source, index, path });
      return '<svg></svg>';
    },
  });
  return {
    job: { mode: 'rehearsal', experiment, block: 0, policy },
    input: { records, manifest },
    dependencies: {
      loadEntry,
      clock: () => {
        time += 100n;
        return time;
      },
    },
    calls,
  };
}
test('3 warmups and 7 alternating pairs retain every unchanged record and median', async () => {
  const f = fixture();
  const result = await measurePairs(f.job, f.input, f.dependencies);
  assert.equal(result.completed, true);
  assert.equal(result.timingEligible, false);
  assert.equal(f.calls.filter((call) => call.source).length, 2 * 2 * 10);
  assert.deepEqual(
    result.records.map((record) => record.base.length),
    [7, 7]
  );
  assert.deepEqual(result.records[0].pairOrder.slice(0, 3), [
    'base/head',
    'head/base',
    'base/head',
  ]);
  assert.equal(result.records[1].pairOrder[0], 'head/base');
  assert.equal(result.records[0].headMedianNs, 100);
  assert.ok(
    f.calls
      .filter((call) => call.source)
      .every((call) => call.source === records[call.index].source)
  );
});
test('source mutation exists only in explicitly named P10 trailing-comment diagnostic', async () => {
  for (const experiment of ['aa', 'pele', 'cache', 'trailing-comment']) {
    const f = fixture(experiment);
    await measurePairs(f.job, f.input, f.dependencies);
    const rendered = f.calls.filter((call) => call.source);
    assert.equal(
      rendered.some((call) => call.source.includes('perf-p10-trailing-comment')),
      experiment === 'trailing-comment'
    );
    if (experiment === 'cache')
      assert.ok(
        f.calls
          .filter((call) => call.side === 'head' && call.reset)
          .every((call) => call.reset.analysis === false)
      );
  }
});
test('an error, missing reset, empty output, invalid policy or timeout fails entire job', async () => {
  const f = fixture();
  await assert.rejects(
    measurePairs(f.job, f.input, {
      ...f.dependencies,
      loadEntry: async () => ({ configure() {}, setup() {}, render() {} }),
    }),
    /reset/
  );
  await assert.rejects(
    measurePairs(f.job, f.input, {
      ...f.dependencies,
      loadEntry: async () => ({
        configure() {},
        setup() {},
        reset() {},
        render() {
          throw new Error('record error');
        },
      }),
    }),
    /record error/
  );
  await assert.rejects(
    measurePairs(
      { ...f.job, policy: { ...policy, timing: { ...policy.timing, pairs: 1 } } },
      f.input,
      f.dependencies
    ),
    /seven pairs/
  );
  let clock = 0n;
  await assert.rejects(
    measurePairs(f.job, f.input, {
      ...f.dependencies,
      clock: () => {
        clock += 31000000000n;
        return clock;
      },
    }),
    /timed out/
  );
});
test('fixed buckets cannot overlap or omit a diagram', () => {
  assert.equal(bucketFor(1024, policy.buckets), 'large');
  assert.throws(() => bucketFor(-1, policy.buckets), /exactly one/);
  assert.throws(
    () => bucketFor(20, [...policy.buckets, { name: 'overlap', minBytes: 0, maxBytes: 100 }]),
    /exactly one/
  );
  assert.equal(median([10, 1, 2, 3, 4, 5, 6]), 4);
});
test('parent watchdog terminates a synchronously stuck render rather than accepting a partial block', async (t) => {
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { resolve } = await import('node:path');
  const { runTimingWorker } = await import('./timing-worker.mjs');
  const directory = mkdtempSync(resolve(tmpdir(), 'perf-watchdog-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const entry = resolve(directory, 'entry.mjs');
  writeFileSync(
    entry,
    'export function configure(){} export function setup(){} export function reset(){} export function render(){while(true){}}'
  );
  const { fileHash } = await import('./scheduler.mjs');
  const artifacts = [{ path: entry, sha256: fileHash(entry) }];
  const sources = [...artifacts];
  const artifactManifest = {
    schema: 1,
    artifacts,
    sources,
    sourceDigest: sha256(JSON.stringify(sources)),
    artifactDigest: sha256(JSON.stringify(artifacts)),
    entries: {
      v13: { timing: { entry }, diagnostic: { entry } },
      pele: { timing: { entry }, diagnostic: { entry } },
    },
  };
  const manifestPath = resolve(directory, 'manifest.json');
  writeFileSync(manifestPath, JSON.stringify(artifactManifest));
  const samplePath = resolve(directory, 'sample.jsonl');
  writeFileSync(samplePath, records.map(JSON.stringify).join('\n') + '\n');
  await assert.rejects(
    runTimingWorker({
      mode: 'rehearsal',
      experiment: 'aa',
      block: 0,
      manifest: manifestPath,
      manifestSha256: fileHash(manifestPath),
      samplePath,
      sampleSha256: fileHash(samplePath),
      policy: { ...policy, timing: { ...policy.timing, renderTimeoutMs: 30 } },
    }),
    /timeout: base.render/
  );
});
test('candidate comparison actually loads independent base and head artifacts', async () => {
  const f = fixture('candidate');
  const headManifest = { entries: { v13: { timing: { entry: '/fake/slower-head.mjs' } } } };
  let time = 0n;
  const paths = [];
  const result = await measurePairs(
    f.job,
    { ...f.input, headManifest },
    {
      clock: () => time,
      loadEntry: async (path) => {
        paths.push(path);
        return {
          configure() {},
          setup() {},
          reset() {},
          render() {
            time += path.includes('slower-head') ? 500n : 100n;
            return '<svg/>';
          },
        };
      },
    }
  );
  assert.deepEqual(paths, ['/fake/v13.mjs', '/fake/slower-head.mjs']);
  assert.equal(result.records[0].headMedianNs / result.records[0].baseMedianNs, 5);
});
