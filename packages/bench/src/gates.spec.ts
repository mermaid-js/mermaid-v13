import { describe, expect, it } from 'vitest';
import { evaluateGates, resolveMode } from './gates.ts';
import type {
  Baseline,
  BenchReport,
  DiagramResult,
  RendererId,
  RendererRun,
  StageTimes,
} from './report.ts';

const KB = 1024;
const CORPUS = 158;

function result(
  id: string,
  warmMs: number | null,
  stages: Partial<StageTimes> = {}
): DiagramResult {
  return {
    id,
    set: 'corpus',
    status: warmMs === null ? 'error' : 'ok',
    firstMs: warmMs,
    warmMs,
    p95Ms: warmMs,
    batch: 1,
    samples: 1,
    stages: { parse: null, measure: null, layout: null, serialise: null, ...stages },
  };
}

function run(
  renderer: RendererId,
  results: DiagramResult[],
  extra: Partial<RendererRun> = {}
): RendererRun {
  return {
    renderer,
    version: '0',
    status: 'ready',
    readyAtMs: 10,
    initMs: 5,
    size: { raw: 0, gzip: 60 * KB, brotli: 0, source: 'loaded', files: [] },
    results,
    ...extra,
  };
}

const ids = Array.from({ length: CORPUS }, (_, i) => `corpus/d${i}`);
const stageTimes = { parse: 0.1, measure: 0.1, layout: 0.2, serialise: 0.05 };

/** A healthy run: every corpus diagram renders 100× faster than frozen 12.2.0. */
function healthy(): BenchReport {
  return {
    schema: 1,
    createdAt: '2026-11-02T00:00:00Z',
    runner: 'test-runner',
    options: {},
    pipeline: { present: true, reason: 'render() returned an <svg>' },
    renderers: [
      run(
        'v13',
        ids.map((id) => result(id, 0.1))
      ),
      run(
        'v13-stages',
        ids.map((id) => result(id, 0.5, stageTimes))
      ),
      run(
        'v12-frozen',
        ids.map((id) => result(id, 10))
      ),
    ],
  };
}

function baseline(scale = 1): Baseline {
  return {
    schema: 1,
    runner: 'test-runner',
    createdAt: '2026-11-01T00:00:00Z',
    stages: Object.fromEntries(
      ids.map((id) => [
        id,
        Object.fromEntries(Object.entries(stageTimes).map(([s, v]) => [s, v * scale])),
      ])
    ),
  };
}

/** `b: null` runs without a stored baseline. */
function gate(report: BenchReport, id: string, b: Baseline | null = baseline()) {
  const outcome = evaluateGates({
    report,
    baseline: b ?? undefined,
    mode: 'enforce',
    corpusSize: CORPUS,
  });
  const g = outcome.gates.find((x) => x.id === id);
  if (!g) throw new Error(`no gate ${id}`);
  return { ...g, exitCode: outcome.exitCode };
}

describe('bench gates (R-PERF-1, -3, -4, -7, -9)', () => {
  it('passes a healthy run and exits 0', () => {
    const outcome = evaluateGates({
      report: healthy(),
      baseline: baseline(),
      mode: 'enforce',
      corpusSize: CORPUS,
    });
    expect(outcome.gates.map((g) => [g.id, g.status])).toEqual([
      ['size', 'pass'],
      ['speed', 'pass'],
      ['ok-count', 'pass'],
      ['stage-regression', 'pass'],
      ['ready-at', 'pass'],
    ]);
    expect(outcome.exitCode).toBe(0);
  });

  it('fails when the loaded core + flowchart size is over 80 KB gzip', () => {
    const report = healthy();
    report.renderers[0]!.size!.gzip = 80 * KB + 1;
    expect(gate(report, 'size')).toMatchObject({ status: 'fail', enforced: true, exitCode: 1 });
    report.renderers[0]!.size!.gzip = 80 * KB;
    expect(gate(report, 'size').status).toBe('pass');
  });

  it('fails when the warm geomean speedup over frozen 12.2.0 dagre is under 50×', () => {
    const report = healthy();
    // 10 ms / 0.25 ms = 40×.
    report.renderers[0]!.results = ids.map((id) => result(id, 0.25));
    expect(gate(report, 'speed')).toMatchObject({ status: 'fail', actual: 40, exitCode: 1 });
  });

  it('computes the speedup over diagrams both renderers rendered, as a geometric mean', () => {
    const report = healthy();
    // Two diagrams: 10/0.1 = 100× and 10/0.4 = 25× → geomean 50×. The rest fail in v12 and are left out.
    report.renderers[0]!.results = ids.map((id, i) => result(id, i === 0 ? 0.1 : 0.4));
    report.renderers[2]!.results = ids.map((id, i) => result(id, i < 2 ? 10 : null));
    expect(gate(report, 'speed')).toMatchObject({ status: 'pass', actual: 50 });
  });

  it('fails unless every corpus diagram renders', () => {
    const report = healthy();
    report.renderers[0]!.results[7] = result('corpus/d7', null);
    expect(gate(report, 'ok-count')).toMatchObject({
      status: 'fail',
      actual: 157,
      limit: 158,
      exitCode: 1,
    });
  });

  it('ignores the Pele sequence and class fixtures in the OK count', () => {
    const report = healthy();
    report.renderers[0]!.results.push({ ...result('pele/sequence', null), set: 'pele' });
    expect(gate(report, 'ok-count').status).toBe('pass');
  });

  it('fails when any stage regresses by more than 10% against the stored baseline', () => {
    // Current layout is 0.2; a baseline of 0.2 / 1.11 makes it an 11% regression.
    const b = baseline();
    for (const id of ids) b.stages[id]!.layout = 0.2 / 1.11;
    expect(gate(healthy(), 'stage-regression', b)).toMatchObject({ status: 'fail', exitCode: 1 });
    expect(gate(healthy(), 'stage-regression', b).detail).toContain('layout');
    expect(gate(healthy(), 'stage-regression', baseline(1 / 1.09)).status).toBe('pass');
  });

  it('only reports the regression gate when this runner has no stored baseline', () => {
    expect(gate(healthy(), 'stage-regression', null)).toMatchObject({
      status: 'skip',
      enforced: false,
      exitCode: 0,
    });
  });

  it('reports "Ready at" over 15 ms without failing (Should)', () => {
    const report = healthy();
    report.renderers[0]!.readyAtMs = 20;
    expect(gate(report, 'ready-at')).toMatchObject({
      status: 'fail',
      enforced: false,
      exitCode: 0,
    });
  });

  it('reports every gate without failing in report mode', () => {
    const report = healthy();
    report.renderers[0]!.results = ids.map((id) => result(id, null));
    const outcome = evaluateGates({
      report,
      baseline: baseline(),
      mode: 'report',
      corpusSize: CORPUS,
    });
    expect(outcome.gates.find((g) => g.id === 'ok-count')).toMatchObject({
      status: 'fail',
      enforced: false,
    });
    expect(outcome.exitCode).toBe(0);
  });
});

describe('gate mode', () => {
  const missing = { present: false, reason: 'mermaid exports no render()' };
  const present = { present: true, reason: 'ok' };

  it('reports while the render pipeline is missing and enforces once it works', () => {
    expect(resolveMode('auto', missing)).toBe('report');
    expect(resolveMode('auto', present)).toBe('enforce');
  });

  it('honours an explicit mode', () => {
    expect(resolveMode('enforce', missing)).toBe('enforce');
    expect(resolveMode('report', present)).toBe('report');
  });
});
