import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type {
  BenchReport,
  DiagramResult,
  RendererRun,
} from '../../../packages/bench/src/report.ts';
import { LIMITS } from '../../../packages/bench/src/gates.ts';
import { evaluatePublicGate } from './public-gate.ts';

const KB = 1024;
const CORPUS = 158;

function result(id: string, warmMs: number | null): DiagramResult {
  return {
    id,
    set: 'corpus',
    status: warmMs === null ? 'error' : 'ok',
    firstMs: warmMs,
    warmMs,
    p95Ms: warmMs,
    batch: 1,
    samples: 1,
    stages: { parse: null, measure: null, layout: null, serialise: null },
  };
}

function run(
  renderer: RendererRun['renderer'],
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

/** A full bench run in which v13 meets every R-PERF limit: 60 KB, 100× faster, 158/158. */
function passing(patch: (r: BenchReport) => void = () => {}): BenchReport {
  const report: BenchReport = {
    schema: 1,
    createdAt: '2026-11-02T00:00:00Z',
    runner: 'github-ubuntu-latest',
    commit: 'abc1234',
    options: { renderers: ['v13', 'v13-stages', 'v12-frozen', 'v12-current'] },
    pipeline: { present: true, reason: 'render() returned an <svg>' },
    renderers: [
      run(
        'v13',
        ids.map((id) => result(id, 1))
      ),
      run(
        'v12-frozen',
        ids.map((id) => result(id, 100)),
        { size: null }
      ),
    ],
  };
  patch(report);
  return report;
}

const input = (
  report: BenchReport,
  extra: Partial<Parameters<typeof evaluatePublicGate>[0]> = {}
) => evaluatePublicGate({ report, corpusSize: CORPUS, dependencyViolations: [], ...extra });

const status = (outcome: ReturnType<typeof evaluatePublicGate>, requirement: string) =>
  outcome.checks.find((c) => c.requirement === requirement)?.status;

describe('public alpha gate (R-REL-3: R-PERF-1…4)', () => {
  it('allows the public publish when every requirement passes', () => {
    const outcome = input(passing(), { expectedCommit: 'abc1234def' });
    expect(outcome.allowed).toBe(true);
    expect(outcome.checks.map((c) => [c.requirement, c.status])).toEqual([
      ['bench run', 'pass'],
      ['R-PERF-1', 'pass'],
      ['R-PERF-2', 'pass'],
      ['R-PERF-3', 'pass'],
      ['R-PERF-4', 'pass'],
    ]);
  });

  it('refuses when the loaded size is over the budget (R-PERF-1)', () => {
    const outcome = input(
      passing((r) => {
        r.renderers[0]!.size!.gzip = LIMITS.loadedGzipBytes + 2 * KB;
      })
    );
    expect(outcome.allowed).toBe(false);
    expect(status(outcome, 'R-PERF-1')).toBe('fail');
  });

  it('refuses when a published package has a runtime dependency (R-PERF-2)', () => {
    const outcome = input(passing(), {
      dependencyViolations: ['@mermaid-js/core: runtime dependency "khroma" is not allowed'],
    });
    expect(outcome.allowed).toBe(false);
    expect(status(outcome, 'R-PERF-2')).toBe('fail');
    expect(outcome.checks.find((c) => c.requirement === 'R-PERF-2')?.detail).toContain('khroma');
  });

  it('refuses when v13 is less than 50× faster than mermaid@12.2.0 dagre (R-PERF-3)', () => {
    const outcome = input(
      passing((r) => {
        for (const d of r.renderers[1]!.results) d.warmMs = 40;
      })
    );
    expect(outcome.allowed).toBe(false);
    expect(status(outcome, 'R-PERF-3')).toBe('fail');
  });

  it('refuses when one corpus diagram fails to render (R-PERF-4)', () => {
    const outcome = input(
      passing((r) => {
        r.renderers[0]!.results[157] = result('corpus/d157', null);
      })
    );
    expect(outcome.allowed).toBe(false);
    expect(status(outcome, 'R-PERF-4')).toBe('fail');
  });

  it('refuses a report whose bench gates only reported because the pipeline probe failed', () => {
    const outcome = input(
      passing((r) => {
        r.pipeline = { present: false, reason: 'render() threw' };
      })
    );
    expect(outcome.allowed).toBe(false);
    expect(status(outcome, 'bench run')).toBe('fail');
  });

  it('refuses a partial bench run (--filter, --tiers, --set or a missing renderer)', () => {
    for (const options of [
      { filter: 'huge' },
      { tiers: ['tiny'] },
      { sets: ['compare'] },
      { renderers: ['v13'] },
    ]) {
      const outcome = input(passing((r) => (r.options = options)));
      expect(outcome.allowed, JSON.stringify(options)).toBe(false);
      expect(status(outcome, 'bench run')).toBe('fail');
    }
  });

  it('refuses a report measured on another commit', () => {
    const outcome = input(passing(), { expectedCommit: 'fff0000' });
    expect(outcome.allowed).toBe(false);
    expect(outcome.checks[0]!.detail).toContain('abc1234');
  });
});

describe('public-gate CLI', () => {
  const cli = fileURLToPath(new URL('./public-gate-cli.ts', import.meta.url));
  const runCli = (report: BenchReport) => {
    const dir = mkdtempSync(join(tmpdir(), 'public-gate-'));
    const path = join(dir, 'latest.json');
    writeFileSync(path, JSON.stringify(report));
    return spawnSync(process.execPath, ['--import', 'tsx', cli, path, '--commit', 'abc1234'], {
      encoding: 'utf8',
      env: { ...process.env, GITHUB_STEP_SUMMARY: '' },
    });
  };

  it('exits 0 and says the publish may run for a passing report', () => {
    const out = runCli(passing());
    expect(out.stdout).toContain('Public alpha publish allowed');
    expect(out.status).toBe(0);
  });

  it('exits 1 and names the failing requirement', () => {
    const out = runCli(
      passing((r) => {
        r.renderers[0]!.size!.gzip = LIMITS.loadedGzipBytes + 10 * KB;
      })
    );
    expect(out.status).toBe(1);
    expect(out.stdout).toMatch(/FAIL\s+R-PERF-1/);
    expect(out.stdout).toContain('Public alpha publish refused');
  });
});
