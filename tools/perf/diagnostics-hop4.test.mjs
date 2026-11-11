import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import {
  buildHop4Artifacts,
  instrumentHop4,
  summarizeHop4,
  verifyHop4Artifacts,
  verifyHop4Equality,
} from './diagnostics-hop4.mjs';
import { sha } from './common.mjs';
import {
  clockPair,
  hop4Stats,
  observeFinal,
  observeHop4,
  resetHop4,
} from './entries/hop4-state.mjs';

const policy = JSON.parse(readFileSync('v13/docs/perf/POLICY.json', 'utf8'));
test('capture is disabled during timing and retains immediate deep snapshots when enabled', () => {
  const model = { nodes: new Map([['A', { x: 1 }]]) };
  resetHop4(false);
  observeHop4(model, 2);
  observeFinal(model);
  assert.deepEqual(hop4Stats(), { calls: 1, durations: [2], models: [], finalModels: [] });
  resetHop4(true);
  observeHop4(model);
  observeFinal(model);
  model.nodes.get('A').x = 99;
  assert.equal(hop4Stats().models[0].nodes.get('A').x, 1);
  assert.equal(hop4Stats().finalModels[0].nodes.get('A').x, 1);
  assert.deepEqual(hop4Stats().durations, []);
  assert(clockPair() >= 0);
});
test('exact boundary source pins reject moved or changed implementations', () => {
  const path = 'packages/core/src/layout/layered/index.ts';
  const source = readFileSync(path, 'utf8');
  assert.equal(instrumentHop4(source, path, 'plain'), source);
  const timed = instrumentHop4(source, path, 'instrumented');
  assert(
    timed.includes(
      'const total = compoundLayout(cnodes, cedges, rootDir, opt);\n  const __hop4Start = performance.now();'
    )
  );
  assert(
    timed.includes(
      'const __hop4Us = (performance.now() - __hop4Start) * 1000;\n  observeHop4(__hop4Model, __hop4Us);'
    )
  );
  assert(!instrumentHop4(source, path, 'control').includes('__hop4Start'));
  assert.throws(() => instrumentHop4(source + '\n', path, 'instrumented'), /source pin mismatch/);
});
function fixture() {
  const records = [
    { source: 'graph TD\nA-->B' },
    { source: 'graph TD\n' + '%% padding\n'.repeat(1500) + 'B-->C' },
  ].map((r) => ({ ...r, sourceSha256: sha(r.source) }));
  const rows = records.map((r, index) => ({
    index,
    sourceSha256: r.sourceSha256,
    sourceBytes: Buffer.byteLength(r.source),
    bucket: index ? 'large' : 'tiny',
    replicates: Array.from({ length: 7 }, (_, repetition) => ({
      repetition,
      order: (index + repetition) % 2 ? 'IP' : 'PI',
      calls: 2,
      clockReads: 4,
      hopUs: [1 + repetition, 2],
      instrumentedTotalUs: 20,
      plainTotalUs: 18,
    })),
  }));
  return { rows, records, policy };
}
test('aggregation includes every invocation, exact fixed buckets and seven raw replicates', () => {
  const f = fixture();
  const aggregate = summarizeHop4(f);
  assert.equal(aggregate[0].records, 2);
  assert.equal(aggregate[0].sumPerRecordMedianHopUs, 12);
  assert.equal(aggregate[0].conversionPassesPerRenderSum, 4);
  assert.equal(aggregate[0].hopFractionOfInstrumented, 0.3);
  assert.deepEqual(aggregate[0].replicateHopSumsUs, [6, 8, 10, 12, 14, 16, 18]);
  assert.equal(aggregate.find((g) => g.bucket === 'large').records, 1);
  for (const mutate of [
    (x) => x.rows.pop(),
    (x) => x.rows.reverse(),
    (x) => (x.rows[0].sourceSha256 = 'wrong'),
    (x) => (x.rows[0].bucket = 'large'),
    (x) => x.rows[0].replicates.pop(),
    (x) => (x.rows[0].replicates[0].clockReads = 2),
    (x) => (x.rows[0].replicates[0].calls = 1),
    (x) => (x.rows[0].replicates[0].hopUs = [NaN, 2]),
    (x) => (x.rows[0].replicates[0].hopUs = [100, 2]),
    (x) => (x.rows[0].replicates[0].order = 'IP'),
  ]) {
    const altered = structuredClone(f);
    mutate(altered);
    assert.throws(() => summarizeHop4(altered));
  }
});
test(
  'matched builds preserve SVG and immediate/final layout for groups, labels, loops, and directions',
  { timeout: 120000 },
  async () => {
    mkdirSync('.tmp', { recursive: true });
    const out = mkdtempSync(resolve('.tmp', 'hop4-controls-'));
    try {
      const built = await buildHop4Artifacts({ out: resolve(out, 'build') });
      const sources = [
        'graph TD',
        'flowchart LR\nsubgraph G[Grouped]\nA[One]-->|route label|B[Two]\nA-->|loop|A\nend\nG-->C',
        'flowchart BT\nA-->B\nB-->C\nC-->A',
        'flowchart RL\nA & B --> C\nC-->C',
      ];
      const result = await verifyHop4Equality({
        manifest: built.manifestPath,
        records: sources.map((source) => ({ source, sourceSha256: sha(source) })),
        out: resolve(out, 'equality'),
      });
      assert.equal(result.complete, true);
      assert.equal(result.records, sources.length);
      const entry = await import(pathToFileURL(built.manifest.entries.instrumented));
      entry.reset();
      entry.resetHop4(false);
      entry.render(sources[3], 3);
      assert(entry.hop4Stats().calls >= 1);
      assert.equal(entry.hop4Stats().durations.length, entry.hop4Stats().calls);
      assert.equal(entry.hop4Stats().models.length, 0);
      const tampered = structuredClone(built.manifest);
      tampered.artifactDigest = 'wrong';
      assert.throws(() => verifyHop4Artifacts(tampered));
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }
);

test('formal collector fails closed on an incomplete sample before rendering', async () => {
  const { collectHop4 } = await import('./diagnostics-hop4.mjs');
  await assert.rejects(
    collectHop4({ manifest: 'missing', records: [], policy, out: '.tmp/must-not-be-created' })
  );
});
