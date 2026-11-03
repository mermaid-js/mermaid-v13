import { describe, expect, it } from 'vitest';
import { evaluateGates } from './gates.ts';
import { COMMENT_MARKER, formatComment, formatMarkdown } from './markdown.ts';
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

  it('adds a Node section, apart from the browser tables, when the Node env ran', () => {
    expect(md).not.toContain('## Node');
    const nodeRun = (renderer: 'v13' | 'v13-base' | 'pele', warmMs: number) => ({
      renderer,
      version: renderer === 'pele' ? '1.13.0' : '13.0.0-alpha.0',
      status: 'ready' as const,
      readyAtMs: null,
      initMs: 1,
      size: null,
      results: [ok('corpus/a', warmMs)],
    });
    const withNode: BenchReport = {
      ...report,
      node: {
        runtime: 'node v24.16.0',
        renderers: [nodeRun('v13', 0.1), nodeRun('v13-base', 0.2), nodeRun('pele', 0.05)],
      },
    };
    const out = formatMarkdown(
      withNode,
      evaluateGates({ report: withNode, baseline: undefined, mode: 'report', corpusSize: 1 })
    );
    const node = out.slice(out.indexOf('## Node'));
    expect(node).toContain('Runtime `node v24.16.0`');
    expect(node).toMatch(/\| v13 \| 13\.0\.0-alpha\.0 \| 1 ms \| 1\/0\/0\/0 \|.*\| 2× \|/);
    expect(node).toContain('### Node diagrams');
    const row = node.split('\n').find((l) => l.startsWith('| corpus/a'));
    // v13 at 0.1 ms: 2× the base (0.2 ms), half of pele (0.05 ms). No v12 columns in Node.
    expect(row).toBe(
      '| corpus/a | corpus | ok | 0.3 | 0.1 | 0.15 | – | – | – | – | 0.2 | 2× | 0.05 | 0.5× |'
    );
    expect(node).not.toContain('v12-frozen');
    // The browser table is unchanged by the Node runs.
    // The browser tables are unchanged by the Node runs; the header names the Node runtime.
    expect(out).toContain(md.slice(md.indexOf('## Gates')).trimEnd());
    expect(out).toContain(', node v24.16.0.');
  });

  it('says the gates are only reporting while the pipeline is missing', () => {
    expect(md).toContain('Gates: report');
    expect(md).toMatch(/\| R-PERF-1 \| Loaded size, core \+ flowchart \(gzip\) \| pass \| no \|/);
  });
});

describe('PR comment', () => {
  const run = (renderer: 'v13' | 'v13-base', results: DiagramResult[]) => ({
    renderer,
    version: renderer === 'v13-base' ? '13.0.0-alpha.0 (abc123456)' : '13.0.0-alpha.0',
    status: 'ready' as const,
    readyAtMs: 5,
    initMs: 1,
    size: null,
    results,
  });
  const withBase: BenchReport = {
    ...report,
    options: { ...report.options, base: 'HEAD^1' },
    renderers: [
      ...report.renderers.map((r) =>
        r.renderer === 'v13' ? { ...r, results: [ok('corpus/a', 0.2), ok('corpus/b', 1)] } : r
      ),
      run('v13-base', [ok('corpus/a', 0.4), ok('corpus/b', 1.02)]),
    ],
  };
  const outcome = evaluateGates({
    report: withBase,
    baseline: undefined,
    mode: 'report',
    corpusSize: 1,
  });

  it('starts with the marker CI finds its own comment by, then the verdict', () => {
    const c = formatComment(withBase, outcome, { runUrl: 'https://ci.example/run/1' });
    const [marker, title] = c.split('\n');
    expect(marker).toBe(COMMENT_MARKER);
    expect(title).toMatch(/^## Bench: /);
    expect(c).toContain('v13-base is `HEAD^1` = 13.0.0-alpha.0 (abc123456).');
    expect(c).toContain('[this run](https://ci.example/run/1)');
  });

  it('names failed enforced gates in the verdict', () => {
    const failing = evaluateGates({
      report: withBase,
      baseline: undefined,
      mode: 'enforce',
      corpusSize: 5,
    });
    expect(formatComment(withBase, failing).split('\n')[1]).toMatch(
      /^## Bench: \d+ gates? failed \(.*R-PERF-4.*\)$/
    );
  });

  it('lists diagrams that moved more than 10% against the base, not the noise', () => {
    const c = formatComment(withBase, outcome);
    expect(c).toContain('### Largest changes vs v13-base (browser)');
    expect(c).toContain(
      'Warm medians of 2 diagrams: 0 more than 10% slower, 1 more than 10% faster.'
    );
    expect(c).toContain('| corpus/a | 0.4 | 0.2 | -50% |');
    expect(c).not.toContain('| corpus/b | 1.02');
  });

  it('folds the per-diagram tables, and drops them when they would not fit', () => {
    const c = formatComment(withBase, outcome);
    expect(c).toContain('<details><summary>Per-diagram times (browser)</summary>');
    const small = formatComment(withBase, outcome, { maxChars: c.length - 1 });
    expect(small).not.toContain('<details>');
    expect(small).toContain('Per-diagram tables are left out to fit the comment size limit.');
    expect(small).toContain('### Renderers');
  });
});
