/**
 * Refuses the public alpha publish unless R-PERF-1…4 pass (R-REL-3). Run after a full bench:
 *
 *   pnpm release:public-gate [packages/bench/dist/reports/latest.json] [--commit <sha>]
 *
 * `--commit` defaults to GITHUB_SHA; when set, the report must have been measured on it.
 * Exit code 0: the publish may run. Exit code 1: it must not.
 */
import { appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadBaseline } from '../../../packages/bench/src/baseline.ts';
import { parseArgs } from '../../../packages/bench/src/cli/args.ts';
import { loadFixtures } from '../../../packages/bench/src/fixtures.ts';
import type { BenchReport } from '../../../packages/bench/src/report.ts';
import { findDependencyViolations, readWorkspace } from '../../check-deps/check-deps.ts';
import { evaluatePublicGate } from './public-gate.ts';

const root = join(import.meta.dirname, '..', '..', '..');
const args = parseArgs(process.argv.slice(2));
const path = args.positional[0] ?? join(root, 'packages/bench/dist/reports/latest.json');
const report = JSON.parse(readFileSync(path, 'utf8')) as BenchReport;
const expectedCommit = args.get('commit') ?? (process.env.GITHUB_SHA || undefined);

const outcome = evaluatePublicGate({
  report,
  corpusSize: loadFixtures().filter((f) => f.set === 'corpus').length,
  dependencyViolations: findDependencyViolations(readWorkspace(root)),
  baseline: loadBaseline(report.runner),
  ...(expectedCommit !== undefined && { expectedCommit }),
});

const lines = outcome.checks.map(
  (c) =>
    `${(c.status === 'pass' ? 'PASS' : 'FAIL').padEnd(4)} ${c.requirement.padEnd(9)} ${c.detail}`
);
const verdict = outcome.allowed
  ? 'Public alpha publish allowed: R-PERF-1…4 pass.'
  : 'Public alpha publish refused: R-PERF-1…4 must all pass (R-REL-3).';
process.stdout.write(`${lines.join('\n')}\n${verdict}\n`);
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `### Public alpha gate\n\n| | Requirement | Detail |\n|---|---|---|\n${outcome.checks
      .map(
        (c) => `| ${c.status === 'pass' ? 'pass' : '**fail**'} | ${c.requirement} | ${c.detail} |`
      )
      .join('\n')}\n\n${verdict}\n`
  );
}
process.exitCode = outcome.allowed ? 0 : 1;
