import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { buildArtifacts } from './build.mjs';
import { collectDiagnostics, runDiagnosticChild } from './diagnostics.mjs';
import { allocationEstimate, parseGcTrace, svgCounts } from './diagnostic-methods.mjs';

const gcLine = (gc, allocated, pause) =>
  `[1:0x123:0] 10 ms: pause=${pause} gc=${gc} allocated=${allocated}`;
const mark = (phase, extra = {}) => `PERF_DIAGNOSTIC ${JSON.stringify({ phase, ...extra })}`;
test('GC reader separates scavenge, other and boundary pauses, rejects incomplete evidence', () => {
  const trace = [
    gcLine('mc', 999, 1),
    mark('batch-start'),
    mark('render-start', { index: 0, repetition: 0 }),
    gcLine('s', 100, 0.2),
    gcLine('mc', 200, 0.4),
    mark('render-end', { index: 0, repetition: 0 }),
    mark('batch-force-end'),
    gcLine('mc', 50, 0.6),
    mark('batch-end'),
  ].join('\n');
  const result = parseGcTrace(trace);
  assert.equal(result.scavengePauseMs, 0.2);
  assert.equal(result.otherGcPauseMs, 0.4);
  assert.equal(result.boundaryGcPauseMs, 0.6);
  assert.equal(result.intervalOccupancyAllocatedBytes, 350);
  assert.throws(() => parseGcTrace(trace.replace(mark('batch-end'), '')), /Incomplete/);
  assert.throws(() => parseGcTrace(trace.replace('gc=s', 'gc=unknown')), /Unsupported/);
});
test('SVG counters respect quotes, comments and CDATA', () => {
  const svg =
    '<svg viewBox="0 0 1 1"><!-- <bad x="1"/> --><g data-v="a > b"><text><![CDATA[<hello>]]></text></g></svg>';
  assert.deepEqual(svgCounts(svg), {
    outputBytes: Buffer.byteLength(svg),
    elements: 3,
    attributes: 2,
  });
  assert.throws(() => svgCounts('<svg x="bad>'), /Unclosed/);
});
test('allocation estimator counts only the named renderer stack and requires sampled evidence', () => {
  const frame = (id, name, size, children = []) => ({
    id,
    callFrame: { functionName: name },
    selfSize: size,
    children,
  });
  const profile = {
    head: frame(0, 'root', 300, [
      frame(1, 'allocationRender', 20, [frame(2, 'nested', 40)]),
      frame(3, 'reset', 100),
    ]),
    samples: [{ nodeId: 2, size: 40 }],
  };
  assert.equal(allocationEstimate(profile, 'allocationRender').estimatedBytes, 60);
  assert.throws(() => allocationEstimate(profile, 'absent'), /No sampled/);
});
test(
  'small real diagnostic rehearsal validates allocations and records every required counter',
  { timeout: 120000 },
  async () => {
    mkdirSync('.tmp', { recursive: true });
    const directory = mkdtempSync(resolve('.tmp', 'diagnostic-test-'));
    try {
      const build = await buildArtifacts({ out: resolve(directory, 'build') });
      const policy = JSON.parse(readFileSync('v13/docs/perf/POLICY.json', 'utf8'));
      policy.diagnostics = { warmups: 1, repetitions: 1, emptyGraphRepetitions: 3 };
      const long =
        'This label is deliberately much wider than the normal configured wrapping width';
      const chain = Array.from({ length: 30 }, (_, i) => `N${i}["${long}"]-->N${i + 1}`).join('\n');
      const records = [
        {
          source: `---\nconfig:\n  themeVariables:\n    fontSize: 14px\n---\n%%{init: {"flowchart":{"wrappingWidth":120}}}%%\nflowchart TD\n%% ordinary comment\nsubgraph box[Group]\nA@{shape: rect, label: "${long}"}-->|label|B\nend\n${chain}`,
        },
      ];
      const result = await collectDiagnostics({
        manifest: build.manifestPath,
        records,
        out: resolve(directory, 'diagnostics'),
        policy,
      });
      assert.equal(result.complete, true);
      assert.equal(result.calibration.length, 6);
      for (const kind of ['v13', 'pele']) {
        assert.ok(result.renderers[kind].totals.measurerCalls > 0);
        assert.ok(result.renderers[kind].totals.outputBytes > 0);
        assert.ok(result.renderers[kind].allocatedBytesEstimate > 0);
        assert.equal(result.renderers[kind].gc.renders.length, 1);
      }
      for (const feature of [
        'frontMatter',
        'initDirectives',
        'themeVariables',
        'shapeData',
        'subgraphs',
        'comments',
        'wideLabels',
        'labelledEdges',
      ])
        assert.ok(result.features.occurrences[feature] > 0, feature);
      assert.ok(result.renderers.v13.totals.metricsCalls > 0);
      assert.equal(Object.hasOwn(result.renderers.pele.totals, 'metricsCalls'), false);
      assert.match(result.methods.measurerCalls, /width-method invocations/);
      assert.equal(result.emptyGraph.repetitions, 3);
      assert.ok(result.rawEvidence.every((item) => item.sha256.length === 64));
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
);

test('watchdog kills a renderer that stops making progress and never reports complete evidence', async () => {
  mkdirSync('.tmp', { recursive: true });
  const directory = mkdtempSync(resolve('.tmp', 'diagnostic-timeout-'));
  try {
    const entry = resolve(directory, 'hung.mjs');
    writeFileSync(
      entry,
      'export function configure(){};export async function verifyReset(){return {}};export async function setup(){};export function reset(){};export function render(){while(true){}};'
    );
    const records = resolve(directory, 'records.json');
    writeFileSync(records, JSON.stringify([{ source: 'graph TD', index: 0 }]));
    await assert.rejects(
      runDiagnosticChild(
        { mode: 'counters', entry, records, warmups: 1, repetitions: 1 },
        directory,
        'hung',
        300
      ),
      /timedOut.*true/
    );
    assert.equal(
      readFileSync(resolve(directory, 'hung.stderr.log'), 'utf8').includes('PERF_PROGRESS'),
      true
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
