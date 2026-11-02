/** Evaluates the public-alpha gate for a saved bench report against this workspace and prints it. */
import { appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadBaseline } from '../../../packages/bench/src/baseline.ts';
import { loadFixtures } from '../../../packages/bench/src/fixtures.ts';
import type { BenchReport } from '../../../packages/bench/src/report.ts';
import { findDependencyViolations, readWorkspace } from '../../check-deps/check-deps.ts';
import type { PublicGateOutcome } from './public-gate.ts';
import { evaluatePublicGate } from './public-gate.ts';

export const ROOT = join(import.meta.dirname, '..', '..', '..');
export const DEFAULT_REPORT = join(ROOT, 'packages/bench/dist/reports/latest.json');

export function runPublicGate(reportPath: string, expectedCommit?: string): PublicGateOutcome {
  const report = JSON.parse(readFileSync(reportPath, 'utf8')) as BenchReport;
  const outcome = evaluatePublicGate({
    report,
    corpusSize: loadFixtures().filter((f) => f.set === 'corpus').length,
    dependencyViolations: findDependencyViolations(readWorkspace(ROOT)),
    baseline: loadBaseline(report.runner),
    ...(expectedCommit !== undefined && { expectedCommit }),
  });

  const verdict = outcome.allowed
    ? 'Public alpha publish allowed: R-PERF-1…4 pass.'
    : 'Public alpha publish refused: R-PERF-1…4 must all pass (R-REL-3).';
  const lines = outcome.checks.map(
    (c) =>
      `${(c.status === 'pass' ? 'PASS' : 'FAIL').padEnd(4)} ${c.requirement.padEnd(9)} ${c.detail}`
  );
  process.stdout.write(`${lines.join('\n')}\n${verdict}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const rows = outcome.checks
      .map(
        (c) => `| ${c.status === 'pass' ? 'pass' : '**fail**'} | ${c.requirement} | ${c.detail} |`
      )
      .join('\n');
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### Public alpha gate\n\n| | Requirement | Detail |\n|---|---|---|\n${rows}\n\n${verdict}\n`
    );
  }
  return outcome;
}
