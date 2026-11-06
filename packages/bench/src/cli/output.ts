/** Writes a report with its gate outcome and prints it; shared by `bench`, `pr` and `gates`. */
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBaseline, saveBaseline } from '../baseline.ts';
import { loadFixtures } from '../fixtures.ts';
import type { GateId, GateInput, GateModeSetting, GateOutcome } from '../gates.ts';
import { evaluateGates, resolveMode } from '../gates.ts';
import { formatMarkdown } from '../markdown.ts';
import type { BenchReport, PipelineState } from '../report.ts';
import { baselineFrom } from '../report.ts';

export const REPORTS_DIR = fileURLToPath(new URL('../../dist/reports/', import.meta.url));

/**
 * The gate mode: `enforce` by default now that the pipeline exists, so a probe that breaks
 * fails instead of dropping back to report mode. `auto` (report while there is no pipeline)
 * and `report` stay available through `--mode` / BENCH_GATES.
 */
export function modeSetting(cli: string | undefined): GateModeSetting {
  const v = cli ?? process.env.BENCH_GATES ?? 'enforce';
  if (v === 'auto' || v === 'report' || v === 'enforce') return v;
  throw new Error(`Unknown gate mode "${v}" (auto, report or enforce)`);
}

const GATE_IDS: readonly GateId[] = [
  'size',
  'core-size',
  'speed',
  'ok-count',
  'stage-regression',
  'ready-at',
  'ascii-size',
  'pele-ratchet',
];

/** Gate ids from a comma list (`--report-only`, else BENCH_REPORT_ONLY) that never fail the job. */
export function reportOnlyGates(cli: string | undefined): GateId[] {
  const v = cli ?? process.env.BENCH_REPORT_ONLY ?? '';
  const ids = v
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  for (const id of ids)
    if (!GATE_IDS.includes(id as GateId))
      throw new Error(`Unknown gate "${id}" (${GATE_IDS.join(', ')})`);
  return ids as GateId[];
}

export function gate(
  report: BenchReport,
  setting: GateModeSetting,
  reportOnly: readonly GateId[] = [],
  extra: Pick<GateInput, 'corpusOk' | 'skip'> = {}
): GateOutcome {
  const corpusSize = loadFixtures().filter((f) => f.set === 'corpus').length;
  return evaluateGates({
    report,
    baseline: loadBaseline(report.runner),
    mode: resolveMode(setting, report.pipeline),
    reportOnly,
    corpusSize,
    ...extra,
  });
}

/** The GitHub Actions run this bench is part of, when it is one. */
export function ciRunUrl(): string | undefined {
  const { GITHUB_SERVER_URL: server, GITHUB_REPOSITORY: repo, GITHUB_RUN_ID: id } = process.env;
  return server && repo && id ? `${server}/${repo}/actions/runs/${id}` : undefined;
}

/** One line per gate on stdout, then the mode. */
export function printGates(outcome: GateOutcome, pipeline: PipelineState): void {
  for (const g of outcome.gates) {
    const failMark = g.enforced ? 'FAIL' : 'WARN';
    const mark = g.status === 'fail' ? failMark : g.status.toUpperCase();
    process.stdout.write(`${mark.padEnd(4)} ${g.requirement.padEnd(17)} ${g.title}: ${g.detail}\n`);
  }
  process.stdout.write(
    `Gates ${outcome.mode === 'enforce' ? 'enforced' : 'reporting only'} (pipeline ${pipeline.present ? 'present' : 'missing'}: ${pipeline.reason}).\n`
  );
}

const shortRev = (rev: string): string | undefined => {
  try {
    return execFileSync('git', ['rev-parse', '--short', rev], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return undefined;
  }
};

/**
 * The commit a report is for, and what was built when that differs. On a PR, CI checks out a
 * merge of the PR into its base, so HEAD is not the commit GitHub shows for the PR: BENCH_COMMIT
 * names that one (the PR head) and HEAD is kept as what was built.
 */
export function commitInfo(): { commit?: string; mergeCommit?: string } {
  const head = shortRev('HEAD');
  const named = process.env.BENCH_COMMIT || undefined;
  const commit = named === undefined ? head : (shortRev(named) ?? named.slice(0, 7));
  const merge = named !== undefined && head !== undefined && head !== commit ? head : undefined;
  return {
    ...(commit !== undefined && { commit }),
    ...(merge !== undefined && { mergeCommit: merge }),
  };
}

export function publish(
  report: BenchReport,
  outcome: GateOutcome,
  opts: { updateBaseline: boolean; write: boolean }
): void {
  const md = formatMarkdown(report, outcome);
  if (opts.write) {
    mkdirSync(REPORTS_DIR, { recursive: true });
    const stamp = report.createdAt.slice(0, 19).replace(/:/g, '');
    for (const name of [stamp, 'latest']) {
      writeFileSync(
        join(REPORTS_DIR, `${name}.json`),
        JSON.stringify({ ...report, gates: outcome }, null, 2) + '\n'
      );
      writeFileSync(join(REPORTS_DIR, `${name}.md`), md);
    }
    process.stdout.write(`Report: ${join(REPORTS_DIR, `${stamp}.md`)}\n`);
  }
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
  printGates(outcome, report.pipeline);
  if (opts.updateBaseline) {
    const baseline = baselineFrom(report);
    if (Object.keys(baseline.stages).length === 0)
      process.stdout.write('No stage timings in this report; baseline not written.\n');
    else process.stdout.write(`Baseline written: ${saveBaseline(baseline)}\n`);
  }
}
