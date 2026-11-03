import { describe, expect, it } from 'vitest';
import { evaluateGates } from './gates.ts';
import { formatMarkdown } from './markdown.ts';
import type { BenchReport, DiagramResult } from './report.ts';

function ok(id: string, warmMs: number, stages?: DiagramResult['stages']): DiagramResult {
  return {
    id,
    set: 'corpus',
    status: 'ok',
    firstMs: warmMs * 3,
    warmMs,
    p95Ms: warmMs * 1.5,
    batch: 1,
    samples: 10,
    stages: stages ?? { parse: null, measure: null, layout: null, serialise: null },
  };
}

const report: BenchReport = {
  schema: 1,
  createdAt: '2026-11-02T00:00:00Z',
  runner: 'test-runner',
  options: { reps: 10 },
  pipeline: { present: true, reason: 'render() returned an <svg>' },
  renderers: [
    {
      renderer: 'v13',
      version: '13.0.0-alpha.0',
      status: 'ready',
      readyAtMs: 9.5,
      initMs: 2,
      size: { raw: 150_000, gzip: 50 * 1024, brotli: 45_000, source: 'loaded', files: [] },
      results: [ok('corpus/a', 0.2)],
    },
    {
      renderer: 'v13-stages',
      version: '13.0.0-alpha.0',
      status: 'ready',
      readyAtMs: 10,
      initMs: 2,
      size: null,
      results: [
        ok('corpus/a', 0.25, { parse: 0.04, measure: 0.06, layout: 0.11, serialise: 0.03 }),
      ],
    },
    {
      renderer: 'v12-frozen',
      version: '12.2.0',
      status: 'ready',
      readyAtMs: 36,
      initMs: 20,
      size: { raw: 900_000, gzip: 213 * 1024, brotli: 180_000, source: 'loaded', files: [] },
      results: [ok('corpus/a', 20)],
    },
  ],
};

describe('markdown report', () => {
  const md = formatMarkdown(
    report,
    evaluateGates({ report, baseline: undefined, mode: 'report', corpusSize: 1 })
  );

  it('has parse, measure, layout and serialise columns (R-PERF-5)', () => {
    const header = md.split('\n').find((l) => l.startsWith('| Diagram'));
    expect(header).toBeDefined();
    expect(header).toMatch(/\| Parse \| Measure \| Layout \| Serialise \|/);
    const row = md.split('\n').find((l) => l.startsWith('| corpus/a'));
    expect(row).toContain('| 0.04 | 0.06 | 0.11 | 0.03 |');
  });

  it('summarises each renderer with Ready at, loaded size and speedup', () => {
    expect(md).toMatch(
      /\| v13 \| 13\.0\.0-alpha\.0 \| 9\.5 ms \| 2 ms \| 50 KB \| 1\/0\/0\/0 \|.*\| 100× \|/
    );
    expect(md).toMatch(/\| v12-frozen \| 12\.2\.0 \| 36 ms \|/);
  });

  it('lists fixtures of types without a v13 package apart from the results', () => {
    const withUnsupported: BenchReport = {
      ...report,
      unsupported: [{ id: 'pele/sequence', set: 'pele', type: 'sequence' }],
    };
    const out = formatMarkdown(
      withUnsupported,
      evaluateGates({ report: withUnsupported, baseline: undefined, mode: 'report', corpusSize: 1 })
    );
    expect(out).toContain('## Not run: no v13 package for the type');
    expect(out).toContain('| pele/sequence | pele | sequence |');
    expect(out.split('\n').filter((l) => l.startsWith('| pele/sequence'))).toHaveLength(1);
    expect(md).not.toContain('Not run');
  });

  it('adds v13-base and pele columns only when those renderers ran', () => {
    expect(md).not.toContain('vs v13-base');
    expect(md).not.toContain('pele warm');
    const run = (renderer: 'v13-base' | 'pele', version: string, warmMs: number) => ({
      renderer,
      version,
      status: 'ready' as const,
      readyAtMs: 5,
      initMs: 1,
      size: null,
      results: [ok('corpus/a', warmMs)],
    });
    const withBoth: BenchReport = {
      ...report,
      renderers: [
        ...report.renderers,
        run('v13-base', '13.0.0-alpha.0 (abc123456)', 0.4),
        run('pele', '1.13.0', 0.1),
      ],
    };
    const out = formatMarkdown(
      withBoth,
      evaluateGates({ report: withBoth, baseline: undefined, mode: 'report', corpusSize: 1 })
    );
    // v13 at 0.2 ms: twice as fast as the base (0.4 ms), half as fast as pele (0.1 ms).
    expect(out).toMatch(/\| v13 \| 13\.0\.0-alpha\.0 \|.*\| 100× \| 2× \|/);
    expect(out).toMatch(/\| v13-base \| 13\.0\.0-alpha\.0 \(abc123456\) \|.*\| 1× \|/);
    expect(out).toMatch(/\| v13-base warm \| vs base \| pele warm \| vs pele \|$/m);
    const row = out.split('\n').find((l) => l.startsWith('| corpus/a'));
    expect(row).toMatch(/\| 0\.4 \| 2× \| 0\.1 \| 0\.5× \|$/);
  });

  it('says the gates are only reporting while the pipeline is missing', () => {
    expect(md).toContain('Gates: report');
    expect(md).toMatch(/\| R-PERF-1 \| Loaded size, core \+ flowchart \(gzip\) \| pass \| no \|/);
  });
});
