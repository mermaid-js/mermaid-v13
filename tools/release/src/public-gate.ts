/**
 * The public-alpha gate (R-REL-3, D28): `mermaid@13.0.0-alpha.N` goes to npm only while M1 meets
 * R-PERF-1…4. R-PERF-1, -3 and -4 come from a bench report (`packages/bench`), always evaluated
 * in `enforce` mode, whatever mode the bench job ran in. R-PERF-2 comes from the dependency check.
 *
 * The report itself must be a full run on the commit being published: a filtered run, a missing
 * renderer or a failed pipeline probe would make the bench numbers meaningless, so they refuse.
 */
import { evaluateGates } from '../../../packages/bench/src/gates.ts';
import type { GateId } from '../../../packages/bench/src/gates.ts';
import type { Baseline, BenchReport, RendererId } from '../../../packages/bench/src/report.ts';

export interface PublicGateInput {
  report: BenchReport;
  /** Number of diagrams in the bench flowchart corpus. */
  corpusSize: number;
  /** `findDependencyViolations` output for the workspace (R-PERF-2). */
  dependencyViolations: string[];
  baseline?: Baseline;
  /** The commit being published; the report's (short) commit must be a prefix of it. */
  expectedCommit?: string;
}

export interface PublicGateCheck {
  requirement: 'bench run' | 'R-PERF-1' | 'R-PERF-2' | 'R-PERF-3' | 'R-PERF-4';
  status: 'pass' | 'fail';
  detail: string;
}

export interface PublicGateOutcome {
  allowed: boolean;
  checks: PublicGateCheck[];
}

/** Renderers the gates read: v13 for size, speed and OK count, v12-frozen as the speed baseline. */
const REQUIRED_RENDERERS: RendererId[] = ['v13', 'v12-frozen'];

const BENCH_GATES: [PublicGateCheck['requirement'], GateId][] = [
  ['R-PERF-1', 'size'],
  ['R-PERF-3', 'speed'],
  ['R-PERF-4', 'ok-count'],
];

function benchRunProblems(report: BenchReport, expectedCommit: string | undefined): string[] {
  const problems: string[] = [];
  if (!report.pipeline.present) problems.push(`pipeline probe failed: ${report.pipeline.reason}`);
  const o = report.options;
  if (o.filter !== undefined && o.filter !== null && o.filter !== '')
    problems.push(`filtered run (--filter ${String(o.filter)})`);
  if (Array.isArray(o.tiers)) problems.push(`tier subset (--tiers ${o.tiers.join(',')})`);
  if (Array.isArray(o.sets) && !o.sets.includes('corpus'))
    problems.push(`corpus not run (--set ${o.sets.join(',')})`);
  for (const id of REQUIRED_RENDERERS) {
    const r = report.renderers.find((x) => x.renderer === id);
    if (r === undefined || (Array.isArray(o.renderers) && !o.renderers.includes(id)))
      problems.push(`renderer ${id} not run`);
    else if (r.status !== 'ready') problems.push(`renderer ${id} ${r.status}`);
  }
  if (expectedCommit !== undefined) {
    if (report.commit === undefined) problems.push('report has no commit');
    else if (!expectedCommit.startsWith(report.commit) && !report.commit.startsWith(expectedCommit))
      problems.push(`report is for commit ${report.commit}, publishing ${expectedCommit}`);
  }
  return problems;
}

export function evaluatePublicGate(input: PublicGateInput): PublicGateOutcome {
  const { report, corpusSize, dependencyViolations, baseline, expectedCommit } = input;
  const checks: PublicGateCheck[] = [];

  const problems = benchRunProblems(report, expectedCommit);
  checks.push({
    requirement: 'bench run',
    status: problems.length === 0 ? 'pass' : 'fail',
    detail:
      problems.length === 0
        ? `full run on ${report.runner}${report.commit === undefined ? '' : ` at ${report.commit}`}`
        : problems.join('; '),
  });

  const gates = evaluateGates({ report, baseline, mode: 'enforce', corpusSize }).gates;
  const fromBench = (requirement: PublicGateCheck['requirement'], id: GateId): PublicGateCheck => {
    const g = gates.find((x) => x.id === id);
    return {
      requirement,
      status: g?.status === 'pass' ? 'pass' : 'fail',
      detail: g === undefined ? `bench gate "${id}" missing` : `${g.title}: ${g.detail}`,
    };
  };

  checks.push(fromBench(...BENCH_GATES[0]!));
  checks.push({
    requirement: 'R-PERF-2',
    status: dependencyViolations.length === 0 ? 'pass' : 'fail',
    detail:
      dependencyViolations.length === 0
        ? 'published packages have no third-party runtime dependencies'
        : dependencyViolations.join('; '),
  });
  for (const [requirement, id] of BENCH_GATES.slice(1)) checks.push(fromBench(requirement, id));

  return { allowed: checks.every((c) => c.status === 'pass'), checks };
}
