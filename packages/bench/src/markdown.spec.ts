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
  const rounds = 20;
  const series = (ms: number, jitter = 0.01) =>
    Array.from({ length: rounds }, (_, i) => ms * (1 + (i % 2 ? jitter : -jitter)));
  const cmpReport: BenchReport = {
    ...report,
    commit: 'abcdef1',
    options: { ...report.options, base: 'HEAD^1' },
    compare: {
      diagrams: [
        { id: 'pele/flowchart-7', label: 'Small (7 nodes)' },
        { id: 'perf/medium3', label: 'Subgraphs and edge labels' },
      ],
      browser: {
        rounds,
        renderers: [
          {
            renderer: 'v13',
            version: '13.0.0-alpha.0',
            size: { raw: 0, gzip: 70 * 1024, brotli: 0, source: 'loaded', files: [] },
          },
          {
            renderer: 'v13-base',
            version: '13.0.0-alpha.0 (abc123456)',
            size: { raw: 0, gzip: 70 * 1024 - 12, brotli: 0, source: 'loaded', files: [] },
          },
          { renderer: 'v12-frozen', version: '12.2.0', size: null },
          { renderer: 'pele', version: '1.13.0', size: null },
        ],
        warm: {
          'pele/flowchart-7': {
            v13: series(0.4),
            'v13-base': series(0.4),
            'v12-frozen': series(20).map((x, i) => (i % 7 === 0 ? x : null)),
            pele: series(0.2),
          },
          'perf/medium3': {
            v13: series(33),
            'v13-base': series(30),
            'v12-frozen': series(1600).map((x, i) => (i % 7 === 0 ? x : null)),
            pele: series(22),
          },
        },
      },
      node: {
        rounds,
        renderers: [
          { renderer: 'v13', version: '13.0.0-alpha.0', size: null },
          { renderer: 'v13-base', version: '13.0.0-alpha.0 (abc123456)', size: null },
          { renderer: 'pele', version: '1.13.0', size: null },
        ],
        warm: {
          'pele/flowchart-7': { v13: series(0.3), 'v13-base': series(0.3), pele: series(0.1) },
          'perf/medium3': { v13: series(25), 'v13-base': series(25), pele: series(10) },
        },
      },
    },
  };
  const outcome = evaluateGates({
    report: cmpReport,
    baseline: undefined,
    mode: 'report',
    corpusSize: 1,
  });
  const comment = formatComment(cmpReport, outcome, {
    runUrl: 'https://ci.example/run/1',
    baseLabel: 'mermaid-v13',
  });

  it('starts with the marker and a title naming the commit and the base', () => {
    const lines = comment.split('\n');
    expect(lines[0]).toBe(COMMENT_MARKER);
    expect(lines[1]).toBe('### Bench: gates pass · `abcdef1` vs `mermaid-v13` (`abc123456`)');
    expect(comment).toContain('[this run](https://ci.example/run/1)');
  });

  it('has one row per comparison diagram and environment, nothing per corpus diagram', () => {
    expect(comment).toContain('**Browser** (20 rounds; mermaid@12 in 3)');
    expect(comment).toContain('| Diagram | v13 | vs base | vs mermaid@12.2.0 | vs Pele |');
    expect(comment).toContain('**Node** (20 rounds)');
    expect(comment).toContain('| Diagram | v13 | vs base | vs Pele |');
    expect(comment).not.toContain('corpus/a');
    expect(comment.split('\n').length).toBeLessThan(30);
  });

  it('says "same" when the interval includes no change, and names a real change', () => {
    expect(comment).toMatch(
      /\| Small \(7 nodes\) \| 0\.4 ms \| same \(±\d+%\) \| 50× faster \| 2× slower \|/
    );
    expect(comment).toMatch(/\| Subgraphs and edge labels \| 33 ms \| 10% slower \(±\d+%\) \|/);
    expect(comment).toContain('Loaded size (gzip): 70 KB (+12 B) against the base.');
  });

  it('names failed gates and corpus diagrams v13 did not render, and only then', () => {
    expect(comment).not.toMatch(/^- /m);
    const broken: BenchReport = {
      ...cmpReport,
      renderers: [
        {
          ...report.renderers[0]!,
          results: [
            ok('corpus/a', 0.2),
            { ...ok('corpus/b', 1), status: 'error', warmMs: null, error: 'boom' },
          ],
        },
        ...report.renderers.slice(1),
      ],
    };
    const failing = evaluateGates({
      report: broken,
      baseline: undefined,
      mode: 'enforce',
      corpusSize: 2,
    });
    const c = formatComment(broken, failing);
    expect(c.split('\n')[1]).toMatch(/^### Bench: \*\*\d+ gates? failed\*\*/);
    expect(c).toMatch(/^- \*\*R-PERF-4\*\* Corpus diagrams rendered: /m);
    expect(c).toContain('- v13 did not render 1 diagram in browser: `corpus/b` (error)');
  });

  it('falls back to the geomean table when no comparison ran', () => {
    const c = formatComment({ ...cmpReport, compare: undefined }, outcome);
    expect(c).toContain('| v13 warm time (geomean) | Browser |');
  });
});
