/** The PR comment (and the PR check's report): one table and one status line. */
import type { GateOutcome } from './gates.ts';
import { countChange, medianCount } from './instruction-counts.ts';
import type { InstructionDiagram } from './instruction-counts.ts';
import { gatesLines } from './markdown.ts';
import { dash, kb, ms, row, rule } from './md.ts';
import type { PrReport } from './pr-check.ts';
import { PR_DIAGRAMS } from './pr-check.ts';
import type { RendererId } from './report.ts';
import { round } from './stats.ts';

/** Hidden first line of the PR comment, so CI updates its own comment instead of adding one. */
export const COMMENT_MARKER = '<!-- mermaid-v13-bench -->';
/** Instruction counts vary by about 1% between runs; a change from here on is shown in bold. */
const NOTABLE = 0.02;

export interface CommentOptions {
  /** Link to the CI run whose artifact holds the full report. */
  runUrl?: string;
  /** What the base is, for the title (CI passes the PR's base branch). */
  baseLabel?: string;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function title(report: PrReport, failed: number, baseLabel: string | undefined): string {
  const verdict = failed === 0 ? 'gates pass' : `**${plural(failed, 'gate')} failed**`;
  const sha = report.base?.version ? /\(([0-9a-f]+)\)$/.exec(report.base.version)?.[1] : undefined;
  const ref = baseLabel ?? report.base?.ref;
  const against = sha ? ` vs ${ref ? `\`${ref}\` ` : ''}(\`${sha}\`)` : '';
  const commit = report.commit ? ` · \`${report.commit}\`` : '';
  return `### Bench: ${verdict}${commit}${against}`;
}

/** `+0.3%`, `**−4.1%**` (bold from 2%), or a dash. */
function changeCell(d: InstructionDiagram | undefined, against: RendererId): string {
  const c = d ? countChange(d, 'v13', against) : null;
  if (!c) return dash;
  const pct = c.change * 100;
  const text = `${pct >= 0 ? '+' : '−'}${Math.abs(pct).toFixed(1)}%`;
  return Math.abs(c.change) >= NOTABLE ? `**${text}**` : text;
}

/** `1.8× more` / `1.2× fewer` instructions than Pele. */
function peleCell(d: InstructionDiagram | undefined): string {
  const a = d ? medianCount(d, 'v13') : null;
  const b = d ? medianCount(d, 'pele') : null;
  if (a === null || b === null) return dash;
  return a >= b ? `${round(a / b, 1)}× more` : `${round(b / a, 1)}× fewer`;
}

function browserCells(report: PrReport, id: string): [string, string] {
  const res = (r: RendererId) =>
    report.renderers.find((x) => x.renderer === r)?.results.find((x) => x.id === id);
  const v13 = res('v13');
  const v12 = res('v12-frozen');
  const warm = v13?.status === 'ok' ? v13.warmMs : null;
  const old = v12?.status === 'ok' ? v12.warmMs : null;
  const speed = warm && old ? `${round(old / warm, 1)}× faster` : dash;
  return [ms(warm), speed];
}

function statusLine(report: PrReport): string {
  const size = report.renderers.find((r) => r.renderer === 'v13')?.size?.gzip;
  const { v13, base } = report.staticGzip;
  const d = base === undefined ? undefined : v13 - base;
  const delta =
    d === undefined
      ? ''
      : ` (${d === 0 ? '±0' : `${d > 0 ? '+' : '−'}${Math.abs(d) < 1024 ? `${Math.abs(d)} B` : kb(Math.abs(d))}`} against the base)`;
  const ready = report.renderers.find((r) => r.renderer === 'v13')?.readyAtMs ?? null;
  const parts = [
    `Loaded size ${kb(size)} gzip${delta}`,
    `Ready at ${ms(ready, 1)}`,
    `${report.corpus.ok}/${report.corpus.total} corpus diagrams render`,
  ];
  return parts.join(' · ');
}

function problemLines(report: PrReport, outcome: GateOutcome): string[] {
  const lines = outcome.gates
    .filter((g) => g.status === 'fail' && g.enforced)
    .map((g) => `- **${g.requirement}** ${g.title}: ${g.detail}`);
  const f = report.corpus.failures;
  if (f.length > 0)
    lines.push(
      `- Did not render: ${f
        .slice(0, 5)
        .map((x) => `\`${x.id}\``)
        .join(', ')}${f.length > 5 ? `, and ${f.length - 5} more` : ''}`
    );
  for (const r of report.instructions?.renderers ?? [])
    if (r.error) lines.push(`- Instruction count failed for ${r.renderer}: ${r.error}`);
  for (const r of report.renderers)
    if (r.status !== 'ready')
      lines.push(`- ${r.renderer} did not start in the browser: ${r.error ?? r.status}`);
  if (report.base?.error) lines.push(`- v13-base not built: ${report.base.error}`);
  return lines.length > 0 ? [...lines, ''] : [];
}

const NOTE =
  'Instructions: CPU instructions per warm render, the median of 3 fresh `node --single-threaded` processes counted with `perf`. They vary by about 1% between runs, so changes under 2% are noise (2% and over is in bold). Browser: one Chromium session per renderer, indicative only. The full browser bench (corpus speed for R-PERF-3, Pele, stages) runs nightly and at release.';

/** The PR comment: verdict, one 5-row table, one status line, problems when there are any. */
export function formatPrComment(
  report: PrReport,
  outcome: GateOutcome,
  options: CommentOptions = {}
): string {
  const failed = outcome.gates.filter((g) => g.status === 'fail' && g.enforced).length;
  const byId = new Map((report.instructions?.diagrams ?? []).map((d) => [d.id, d]));
  const run = options.runUrl ? `[this run](${options.runUrl})` : 'this run';
  return [
    COMMENT_MARKER,
    title(report, failed, options.baseLabel),
    '',
    row(['Diagram', 'v13 instructions', 'vs base', 'vs Pele', 'v13 in browser', 'vs mermaid@12']),
    rule(6),
    ...PR_DIAGRAMS.map((d) => {
      const counted = byId.get(d.id);
      const m = counted ? medianCount(counted, 'v13') : null;
      return row([
        d.label,
        m === null ? dash : `${round(m / 1e6, 1)} M`,
        changeCell(counted, 'v13-base'),
        peleCell(counted),
        ...browserCells(report, d.id),
      ]);
    }),
    '',
    statusLine(report),
    '',
    ...problemLines(report, outcome),
    ...(report.instructionsSkipped
      ? [`Instruction counts not measured: ${report.instructionsSkipped}.`, '']
      : []),
    `<sub>${NOTE}</sub>`,
    '',
    `Full report: \`bench-report\` artifact of ${run}.`,
  ].join('\n');
}

/** The PR check's own report: the comment plus the gates table. */
export function formatPrReport(report: PrReport, outcome: GateOutcome): string {
  return [
    formatPrComment(report, outcome).split('\n').slice(1).join('\n'),
    '',
    ...gatesLines(outcome, '###'),
  ].join('\n');
}
