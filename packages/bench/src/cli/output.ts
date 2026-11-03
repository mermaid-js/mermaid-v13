/** Writes a report with its gate outcome and prints it; shared by `bench` and `gates`. */
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBaseline, saveBaseline } from '../baseline.ts';
import { loadFixtures } from '../fixtures.ts';
import type { GateId, GateModeSetting, GateOutcome } from '../gates.ts';
import { evaluateGates, resolveMode } from '../gates.ts';
import { formatMarkdown } from '../markdown.ts';
import type { BenchReport } from '../report.ts';
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

const GATE_IDS: readonly GateId[] = ['size', 'speed', 'ok-count', 'stage-regression', 'ready-at'];

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
  reportOnly: readonly GateId[] = []
): GateOutcome {
  const corpusSize = loadFixtures().filter((f) => f.set === 'corpus').length;
  return evaluateGates({
    report,
    baseline: loadBaseline(report.runner),
    mode: resolveMode(setting, report.pipeline),
    reportOnly,
    corpusSize,
  });
}

export function publish(
  report: BenchReport,
  outcome: GateOutcome,
  opts: { updateBaseline: boolean; write: boolean }
) {
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
  for (const g of outcome.gates) {
    const failMark = g.enforced ? 'FAIL' : 'WARN';
    const mark = g.status === 'fail' ? failMark : g.status.toUpperCase();
    process.stdout.write(`${mark.padEnd(4)} ${g.requirement.padEnd(17)} ${g.title}: ${g.detail}\n`);
  }
  process.stdout.write(
    `Gates ${outcome.mode === 'enforce' ? 'enforced' : 'reporting only'} (pipeline ${report.pipeline.present ? 'present' : 'missing'}: ${report.pipeline.reason}).\n`
  );
  if (opts.updateBaseline) {
    const baseline = baselineFrom(report);
    if (Object.keys(baseline.stages).length === 0)
      process.stdout.write('No stage timings in this report; baseline not written.\n');
    else process.stdout.write(`Baseline written: ${saveBaseline(baseline)}\n`);
  }
}
