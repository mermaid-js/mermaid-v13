/** Evaluates the public-alpha gate for a saved bench report against this workspace and prints it. */
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadBaseline } from '../../../packages/bench/src/baseline.ts';
import { loadFixtures } from '../../../packages/bench/src/fixtures.ts';
import type { BenchReport } from '../../../packages/bench/src/report.ts';
import { findDependencyViolations, readWorkspace } from '../../check-deps/check-deps.ts';
import type { PublicGateOutcome } from './public-gate.ts';
import { evaluatePublicGate } from './public-gate.ts';

export const ROOT = join(import.meta.dirname, '..', '..', '..');
export const DEFAULT_REPORT = join(ROOT, 'packages/bench/dist/reports/latest.json');

function evaluate(report: BenchReport, expectedCommit?: string): PublicGateOutcome {
  return evaluatePublicGate({
    report,
    corpusSize: loadFixtures().filter((f) => f.set === 'corpus').length,
    dependencyViolations: findDependencyViolations(readWorkspace(ROOT)),
    baseline: loadBaseline(report.runner),
    ...(expectedCommit !== undefined && { expectedCommit }),
  });
}

const checkLines = (outcome: PublicGateOutcome): string[] =>
  outcome.checks.map(
    (c) =>
      `${(c.status === 'pass' ? 'PASS' : 'FAIL').padEnd(4)} ${c.requirement.padEnd(9)} ${c.detail}`
  );

function summarise(title: string, outcome: PublicGateOutcome, footer: string): void {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  const rows = outcome.checks
    .map((c) => `| ${c.status === 'pass' ? 'pass' : '**fail**'} | ${c.requirement} | ${c.detail} |`)
    .join('\n');
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `### ${title}\n\n| | Requirement | Detail |\n|---|---|---|\n${rows}\n\n${footer}\n`
  );
}

export function runPublicGate(reportPath: string, expectedCommit?: string): PublicGateOutcome {
  const outcome = evaluate(
    JSON.parse(readFileSync(reportPath, 'utf8')) as BenchReport,
    expectedCommit
  );
  const verdict = outcome.allowed
    ? 'Public alpha publish allowed: R-PERF-1…4 pass.'
    : 'Public alpha publish refused: R-PERF-1…4 must all pass (R-REL-3).';
  process.stdout.write(`${checkLines(outcome).join('\n')}\n${verdict}\n`);
  summarise('Public alpha gate', outcome, verdict);
  return outcome;
}

/**
 * `--skip-gate`: the gate on the last known bench report, shown and never enforced, so the
 * release record says how far R-PERF-1…4 are. A report of another commit is fine here.
 */
export function showLastKnownBench(
  reportPath: string | undefined,
  reason: string,
  publishing?: string
): void {
  const skipped = `Public alpha gate (R-PERF-1…4) SKIPPED by the release master: ${reason}`;
  if (reportPath === undefined) {
    process.stdout.write(
      `${skipped}\nNo bench report found: pass --bench-report <latest.json>, or let the nightly bench run.\n`
    );
    if (process.env.GITHUB_STEP_SUMMARY)
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### ${skipped}\n\nNo bench report found.\n`);
    return;
  }
  const report = JSON.parse(readFileSync(reportPath, 'utf8')) as BenchReport;
  const outcome = evaluate(report);
  const other =
    publishing !== undefined && report.commit !== undefined && !publishing.startsWith(report.commit)
      ? `, publishing ${publishing.slice(0, 9)}`
      : '';
  const header = `Last known bench, not enforced: ${report.createdAt} on ${report.runner}, commit ${report.commit ?? '?'}${other}`;
  process.stdout.write(`${skipped}\n${header}\n${checkLines(outcome).join('\n')}\n`);
  summarise(skipped, outcome, header);
}

/** The newest successful nightly bench report of the release branch, downloaded with gh. */
export function fetchNightlyReport(): string | undefined {
  const config = JSON.parse(readFileSync(join(ROOT, '.changeset/config.json'), 'utf8')) as {
    baseBranch: string;
  };
  const gh = (argv: string[]) =>
    execFileSync('gh', argv, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  try {
    const id = gh([
      'run',
      'list',
      '--workflow',
      'bench-nightly.yml',
      '--branch',
      config.baseBranch,
      '--status',
      'success',
      '--limit',
      '1',
      '--json',
      'databaseId',
      '--jq',
      '.[0].databaseId // empty',
    ]);
    if (id === '') return undefined;
    const dir = mkdtempSync(join(tmpdir(), 'nightly-bench-'));
    gh(['run', 'download', id, '--name', 'bench-nightly-report', '--dir', dir]);
    const file = join(dir, 'latest.json');
    return existsSync(file) ? file : undefined;
  } catch {
    return undefined;
  }
}
