import { describe, expect, it } from 'vitest';
import { evaluateGates } from './gates.ts';
import type { InstructionDiagram, InstructionRun } from './instruction-counts.ts';
import type { PrReport } from './pr-check.ts';
import { PR_DIAGRAMS } from './pr-check.ts';
import { COMMENT_MARKER, formatPrComment } from './pr-markdown.ts';
import type { BenchReport, DiagramResult, RendererRun } from './report.ts';
import { emptyStages } from './report.ts';

const ok = (id: string, warmMs: number): DiagramResult => ({
  id,
  set: 'pele',
  status: 'ok',
  firstMs: warmMs * 3,
  warmMs,
  p95Ms: warmMs,
  batch: 1,
  samples: 10,
  stages: emptyStages(),
});
const run = (renderer: 'v13' | 'v12-frozen', factor: number, gzip?: number): RendererRun => ({
  renderer,
  version: renderer === 'v13' ? '13.0.0-alpha.0' : '12.2.0',
  status: 'ready',
  readyAtMs: renderer === 'v13' ? 7.46 : 12,
  initMs: 1,
  size: gzip === undefined ? null : { raw: 0, gzip, brotli: 0, source: 'loaded', files: [] },
  results: PR_DIAGRAMS.map((d, i) => ok(d.id, (i + 1) * factor)),
});
const counted = (
  base: number,
  v13: number[],
  baseCounts: number[],
  pele: number
): InstructionDiagram => ({
  id: '',
  label: '',
  measured: 20,
  counts: { v13, 'v13-base': baseCounts, pele: [pele, pele, pele] },
});
const instructions: InstructionRun = {
  repeats: 3,
  renderers: [
    { renderer: 'v13', version: '13.0.0-alpha.0' },
    { renderer: 'v13-base', version: '13.0.0-alpha.0 (abc123456)' },
    { renderer: 'pele', version: '1.13.0' },
  ],
  diagrams: PR_DIAGRAMS.map((d, i) => {
    const n = (i + 1) * 1e7;
    // The fourth diagram (subgraphs) needs 5% more instructions than the base.
    const v13 = i === 3 ? [n * 1.05, n * 1.051, n * 1.049] : [n * 1.002, n, n * 0.999];
    return { ...counted(n, v13, [n, n, n], n / 2), id: d.id, label: d.label };
  }),
};
const report: PrReport = {
  schema: 1,
  createdAt: '2026-11-03T00:00:00Z',
  runner: 'test',
  commit: 'abcdef1',
  base: { ref: 'HEAD^1', version: '13.0.0-alpha.0 (abc123456)' },
  pipeline: { present: true, reason: 'ok' },
  browser: 'chromium 1',
  node: 'node v24.16.0',
  staticGzip: { v13: 70 * 1024, base: 70 * 1024 - 12 },
  asciiSize: null,
  renderers: [run('v13', 0.5, 70 * 1024), run('v12-frozen', 25)],
  corpus: { ok: 158, total: 158, failures: [] },
  instructions,
};
const view = (r: PrReport): BenchReport => ({
  schema: 1,
  createdAt: r.createdAt,
  runner: r.runner,
  options: {},
  pipeline: r.pipeline,
  renderers: r.renderers,
});
const outcomeOf = (r: PrReport, mode: 'report' | 'enforce' = 'enforce') =>
  evaluateGates({
    report: view(r),
    baseline: undefined,
    mode,
    corpusSize: 158,
    corpusOk: r.corpus.ok,
    skip: { speed: 'nightly', 'stage-regression': 'nightly' },
  });

describe('PR comment', () => {
  const comment = formatPrComment(report, outcomeOf(report), {
    runUrl: 'https://ci.example/run/1',
    baseLabel: 'mermaid-v13',
  });
  const lines = comment.split('\n');

  it('is short: marker, verdict title, one 5-row table, a status line and the link', () => {
    expect(lines[0]).toBe(COMMENT_MARKER);
    expect(lines[1]).toBe('### Bench: gates pass · `abcdef1` vs `mermaid-v13` (`abc123456`)');
    expect(comment).toContain(
      '| Diagram | v13 instructions | vs base | vs Pele | v13 in browser | vs mermaid@12 |'
    );
    expect(lines.filter((l) => l.startsWith('| ') && !l.startsWith('| Diagram'))).toHaveLength(6);
    expect(comment).toContain('[this run](https://ci.example/run/1)');
    expect(lines.length).toBeLessThan(20);
  });

  it('shows instruction changes as percentages, bold from 2%', () => {
    expect(comment).toContain('| Small (7 nodes) | 10 M | +0.0% | 2× more | 0.5 ms | 50× faster |');
    expect(comment).toContain(
      '| Subgraphs and edge labels | 42 M | **+5.0%** | 2.1× more | 2 ms | 50× faster |'
    );
  });

  it('puts size, Ready at and the corpus count on one line', () => {
    expect(comment).toContain(
      'Loaded size 70 KB gzip (+12 B against the base) · Ready at 7.5 ms · 158/158 corpus diagrams render'
    );
    expect(comment).not.toMatch(/^- /m);
  });

  it('names failed gates and the diagrams that did not render, and only then', () => {
    const broken: PrReport = {
      ...report,
      corpus: { ok: 157, total: 158, failures: [{ id: 'corpus/x', error: 'boom' }] },
    };
    const c = formatPrComment(broken, outcomeOf(broken));
    expect(c.split('\n')[1]).toMatch(/^### Bench: \*\*1 gate failed\*\*/);
    expect(c).toContain('- **R-PERF-4** Corpus diagrams rendered: 157/158 rendered');
    expect(c).toContain('- Did not render: `corpus/x`');
  });

  it('says when instruction counts could not be measured', () => {
    const { instructions: _, ...rest } = report;
    const noPerf: PrReport = { ...rest, instructionsSkipped: 'no perf here' };
    const c = formatPrComment(noPerf, outcomeOf(noPerf));
    expect(c).toContain('| Small (7 nodes) | – | – | – | 0.5 ms | 50× faster |');
    expect(c).toContain('Instruction counts not measured: no perf here.');
  });
});

describe('PR gates', () => {
  it('take the corpus count from Node and skip what the full bench measures', () => {
    const outcome = outcomeOf(report);
    const byId = new Map(outcome.gates.map((g) => [g.id, g]));
    expect(byId.get('ok-count')?.status).toBe('pass');
    expect(byId.get('speed')).toMatchObject({ status: 'skip', enforced: false, detail: 'nightly' });
    expect(byId.get('stage-regression')?.status).toBe('skip');
    expect(outcome.exitCode).toBe(0);
  });
});
