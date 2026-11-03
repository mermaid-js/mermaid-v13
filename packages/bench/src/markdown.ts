/** Markdown rendering of a bench report: summary, gates and the per-diagram table. */
import type { GateOutcome } from './gates.ts';
import { speedup } from './gates.ts';
import type { Change } from './compare-stats.ts';
import { medianOf, medianSpeedup, pairedChange } from './compare-stats.ts';
import type {
  BenchReport,
  CompareEnv,
  Comparison,
  DiagramResult,
  NodeRuns,
  RendererId,
  RendererRun,
} from './report.ts';
import { STAGES, rendererRun } from './report.ts';
import { round } from './stats.ts';

const dash = '–';
const ms = (v: number | null | undefined, digits = 2) =>
  v === null || v === undefined ? dash : `${round(v, digits)} ms`;
// Two decimals for ms and up, three significant digits below (stage times are often µs).
const num = (v: number | null | undefined) =>
  v === null || v === undefined
    ? dash
    : String(Math.abs(v) >= 1 ? round(v, 2) : Number(v.toPrecision(3)));
const kb = (bytes: number | undefined) =>
  bytes === undefined ? dash : `${round(bytes / 1024, 1)} KB`;
const row = (cells: (string | number)[]) => `| ${cells.join(' | ')} |`;
const capital = (s: string) => s[0]!.toUpperCase() + s.slice(1);

/** Ids every ready renderer rendered: the set Σ columns and the geomean use. */
function commonIds(runs: RendererRun[]): Set<string> {
  const ready = runs.filter((r) => r.status === 'ready');
  if (ready.length === 0) return new Set();
  const okIds = (r: RendererRun) =>
    new Set(r.results.filter((x) => x.status === 'ok').map((x) => x.id));
  let common = okIds(ready[0]!);
  for (const r of ready.slice(1)) {
    const ids = okIds(r);
    common = new Set([...common].filter((id) => ids.has(id)));
  }
  return common;
}

function counts(results: DiagramResult[]): string {
  const n = (s: DiagramResult['status']) => results.filter((r) => r.status === s).length;
  return `${n('ok')}/${n('error')}/${n('timeout')}/${n('missing')}`;
}

function sum(
  results: DiagramResult[],
  common: Set<string>,
  key: 'warmMs' | 'firstMs'
): number | null {
  const picked = results.filter((r) => common.has(r.id) && r[key] !== null);
  return picked.length === 0 ? null : picked.reduce((a, r) => a + r[key]!, 0);
}

type Heading = '##' | '###';
const times = (v: number | null) => (v === null ? dash : `${v}×`);

function headerLines(report: BenchReport): string[] {
  const base =
    rendererRun(report, 'v13-base') ??
    report.node?.renderers.find((r) => r.renderer === 'v13-base');
  return [
    `Runner \`${report.runner}\`${report.browser ? `, ${report.browser}` : ''}${report.node ? `, ${report.node.runtime}` : ''}${report.commit ? `, commit \`${report.commit}\`` : ''}${report.mergeCommit ? ` (built as \`${report.mergeCommit}\`, its merge with the base branch)` : ''}.`,
    ...(base?.status === 'ready' && typeof report.options.base === 'string'
      ? [`v13-base is \`${report.options.base}\` = ${base.version}.`]
      : []),
    `Pipeline ${report.pipeline.present ? 'present' : 'missing'}: ${report.pipeline.reason}.`,
    '',
  ];
}

function gatesLines(outcome: GateOutcome, h: Heading): string[] {
  return [
    `${h} Gates: ${outcome.mode}${outcome.mode === 'report' ? ' (computed, never fail the job)' : ''}`,
    '',
    row(['Requirement', 'Gate', 'Status', 'Enforced', 'Detail']),
    row(['---', '---', '---', '---', '---']),
    ...outcome.gates.map((g) =>
      row([g.requirement, g.title, g.status, g.enforced ? 'yes' : 'no', g.detail])
    ),
    '',
  ];
}

function browserRenderersLines(report: BenchReport, h: Heading): string[] {
  const common = commonIds(report.renderers);
  const hasBase = rendererRun(report, 'v13-base')?.status === 'ready';
  const out: string[] = [`${h} Renderers`, ''];
  out.push(
    `Σ columns and the geomean use the ${common.size} diagrams every ready renderer rendered. Counts are ok/error/timeout/missing.`,
    ''
  );
  out.push(
    row([
      'Renderer',
      'Version',
      'Ready at',
      'Init',
      'Loaded (gz)',
      'Counts',
      'Σ warm (common)',
      'Σ first (common)',
      'vs v12-frozen (geomean)',
      ...(hasBase ? ['vs v13-base (geomean)'] : []),
    ]),
    row(Array<string>(hasBase ? 10 : 9).fill('---'))
  );
  const notes: string[] = [];
  for (const r of report.renderers) {
    out.push(
      row([
        r.renderer,
        r.version,
        ms(r.readyAtMs, 1),
        ms(r.initMs, 1),
        kb(r.size?.gzip) + (r.size?.source === 'static' ? ' (static)' : ''),
        counts(r.results),
        ms(sum(r.results, common, 'warmMs')),
        ms(sum(r.results, common, 'firstMs')),
        times(speedup(report, r.renderer, 'v12-frozen').value),
        ...(hasBase ? [times(speedup(report, r.renderer, 'v13-base').value)] : []),
      ])
    );
    if (r.error) notes.push(`- ${r.renderer}: ${r.error}`);
  }
  out.push('', ...notes, ...(notes.length > 0 ? [''] : []));
  return out;
}

const DIAGRAMS_NOTE =
  'Times are per render. Stage columns are medians from the instrumented `v13-stages` build. "Speedup" and "vs …" are that renderer\'s warm time over v13\'s (above 1× means v13 is faster).';

function browserDiagramsLines(report: BenchReport): string[] {
  return [
    DIAGRAMS_NOTE,
    '',
    ...diagramsTable(report.renderers, [
      { id: 'v12-frozen', ratio: 'Speedup', always: true },
      { id: 'v13-base', ratio: 'vs base' },
      { id: 'pele', ratio: 'vs pele' },
    ]),
  ];
}

function nodeDiagramsLines(node: NodeRuns): string[] {
  return diagramsTable(node.renderers, [
    { id: 'v13-base', ratio: 'vs base' },
    { id: 'pele', ratio: 'vs pele' },
  ]);
}

function unsupportedLines(report: BenchReport, h: Heading): string[] {
  const unsupported = report.unsupported ?? [];
  if (unsupported.length === 0) return [];
  return [
    `${h} Not run: no v13 package for the type`,
    '',
    row(['Diagram', 'Set', 'Type']),
    row(Array<string>(3).fill('---')),
    ...unsupported.map((u) => row([u.id, u.set, u.type])),
    '',
  ];
}

export function formatMarkdown(report: BenchReport, outcome: GateOutcome): string {
  return [
    `# Bench report ${report.createdAt}`,
    '',
    ...headerLines(report),
    ...gatesLines(outcome, '##'),
    ...browserRenderersLines(report, '##'),
    ...(report.compare
      ? ['## Comparison', '', COMPARE_NOTE, '', ...compareLines(report.compare, '###')]
      : []),
    '## Diagrams',
    '',
    ...browserDiagramsLines(report),
    ...(report.node
      ? [
          ...nodeSummaryLines(report, report.node, '##'),
          '### Node diagrams',
          '',
          ...nodeDiagramsLines(report.node),
        ]
      : []),
    ...unsupportedLines(report, '##'),
  ].join('\n');
}

/** Hidden first line of the PR comment, so CI updates its own comment instead of adding one. */
export const COMMENT_MARKER = '<!-- mermaid-v13-bench -->';
/** `2% slower` / `4% faster` / `same` from a geomean speedup (above 1 means v13 is faster). */
function relative(speed: number | null): string {
  if (speed === null) return dash;
  const change = 1 / speed - 1;
  if (Math.abs(change) < 0.005) return 'same';
  return `${Math.round(Math.abs(change) * 100)}% ${change > 0 ? 'slower' : 'faster'}`;
}

/** `22× faster` / `2.3× slower` from a geomean speedup. */
function factor(speed: number | null): string {
  if (speed === null) return dash;
  return speed >= 1 ? `${round(speed, 1)}× faster` : `${round(1 / speed, 1)}× slower`;
}

export interface CommentOptions {
  /** Link to the CI run whose artifact holds the full report. */
  runUrl?: string;
  /** What the base is, for the title (CI passes the PR's base branch). */
  baseLabel?: string;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Version and loaded size (gzip bytes) of a renderer, from any run or the comparison. */
function infoOf(
  report: BenchReport,
  id: RendererId
): { version: string; gzip?: number } | undefined {
  const fromRun = (r: RendererRun | undefined) =>
    r?.status === 'ready' ? { version: r.version, gzip: r.size?.gzip } : undefined;
  const fromCompare = (env: CompareEnv | undefined) => {
    const r = env?.renderers.find((x) => x.renderer === id && x.error === undefined);
    return r ? { version: r.version, gzip: r.size?.gzip } : undefined;
  };
  return (
    fromCompare(report.compare?.browser) ??
    fromRun(rendererRun(report, id)) ??
    fromCompare(report.compare?.node) ??
    fromRun(report.node?.renderers.find((r) => r.renderer === id))
  );
}

/** The title: the gate verdict, the commit and the base it is compared with. */
function titleLine(report: BenchReport, failed: number, baseLabel: string | undefined): string {
  const verdict = failed === 0 ? 'gates pass' : `**${plural(failed, 'gate')} failed**`;
  const base = infoOf(report, 'v13-base');
  const sha = base ? /\(([0-9a-f]+)\)$/.exec(base.version)?.[1] : undefined;
  const ref = baseLabel ?? (typeof report.options.base === 'string' ? report.options.base : '');
  const label = ref ? `\`${ref}\` ` : '';
  const against = sha ? ` vs ${label}(\`${sha}\`)` : '';
  const commit = report.commit ? ` · \`${report.commit}\`` : '';
  return `### Bench: ${verdict}${commit}${against}`;
}

/** Loaded size of v13, with the change against the base when both were measured. */
function sizeCell(report: BenchReport): string {
  const size = infoOf(report, 'v13')?.gzip;
  const base = infoOf(report, 'v13-base')?.gzip;
  if (size === undefined || base === undefined) return kb(size);
  const d = Math.abs(size - base);
  // Under 1 KB the change is shown in bytes, so a few bytes do not read as "−0 KB".
  const amount = d < 1024 ? `${d} B` : kb(d);
  const delta = d === 0 ? '±0' : `${size > base ? '+' : '−'}${amount}`;
  return `${kb(size)} (${delta})`;
}

/** One row per comparison, one column per environment that ran. */
function summaryTable(report: BenchReport): string[] {
  const envs: BenchReport[] = [report];
  if (report.node) envs.push({ ...report, renderers: report.node.renderers });
  const ready = (r: BenchReport, id: RendererId) =>
    r.renderers.some((x) => x.renderer === id && x.status === 'ready');
  const cells = (id: RendererId, show: (s: number | null) => string) =>
    envs.map((r) => (ready(r, 'v13') && ready(r, id) ? show(speedup(r, 'v13', id).value) : dash));
  return [
    row(['v13 warm time (geomean)', 'Browser', ...(report.node ? ['Node'] : [])]),
    row(Array<string>(envs.length + 1).fill('---')),
    row(['vs base branch', ...cells('v13-base', relative)]),
    row(['vs mermaid@12.2.0', ...cells('v12-frozen', factor)]),
    row(['vs Pele', ...cells('pele', factor)]),
    row(['Loaded size (gzip)', sizeCell(report), ...(report.node ? [dash] : [])]),
    '',
  ];
}

/** One line per failed enforced gate and per environment where v13 did not render a fixture. */
function problemLines(report: BenchReport, failed: GateOutcome['gates']): string[] {
  const v13Runs = [
    { env: 'browser', run: rendererRun(report, 'v13') },
    { env: 'Node', run: report.node?.renderers.find((r) => r.renderer === 'v13') },
  ];
  const broken = v13Runs.flatMap(({ env, run }) => {
    const bad = (run?.results ?? []).filter((r) => r.status !== 'ok');
    if (bad.length === 0) return [];
    const ids = bad.slice(0, 5).map((r) => `\`${r.id}\` (${r.status})`);
    return [
      `- v13 did not render ${plural(bad.length, 'diagram')} in ${env}: ${ids.join(', ')}${bad.length > 5 ? ', …' : ''}`,
    ];
  });
  const lines = [...failed.map((g) => `- **${g.requirement}** ${g.title}: ${g.detail}`), ...broken];
  return lines.length > 0 ? [...lines, ''] : [];
}

/**
 * The PR comment: only the overall picture. The verdict, v13's geomean against the base branch,
 * Mermaid 12 and Pele in each environment, the loaded size, and, only when there are any,
 * failed gates and diagrams v13 failed to render. Per-diagram times are in the full report,
 * which the comment links to: one CI run of a single diagram is too noisy to act on.
 */
export function formatComment(
  report: BenchReport,
  outcome: GateOutcome,
  options: CommentOptions = {}
): string {
  const failed = outcome.gates.filter((g) => g.status === 'fail' && g.enforced);
  const run = options.runUrl ? `[this run](${options.runUrl})` : 'this run';
  const cmp = report.compare;
  const body = cmp
    ? [
        ...compareLines(cmp, '**'),
        `Loaded size (gzip): ${sizeCell(report)} against the base.`,
        '',
        COMPARE_NOTE,
        '',
      ]
    : summaryTable(report);
  return [
    COMMENT_MARKER,
    titleLine(report, failed.length, options.baseLabel),
    '',
    ...body,
    ...problemLines(report, failed),
    `Full report: \`bench-report\` artifact of ${run}.`,
  ].join('\n');
}

const COMPARE_NOTE =
  'Times are the median over rounds, each round in fresh pages or processes with the renderers alternating. Instruction counts are per warm render in fresh `node --single-threaded` processes, measured with `perf`. ± is the 95% interval of the change against the base; "same" means that interval includes no change.';

/** Words for a change: time is slower/faster, instruction counts are more/fewer. */
interface Words {
  up: string;
  down: string;
}
const TIME: Words = { up: 'slower', down: 'faster' };
const INSTRUCTIONS: Words = { up: 'more', down: 'fewer' };

/** `same (±3%)` / `6% slower (±2%)` from a paired change of v13 against the base. */
function changeCell(c: Change | null, words: Words = TIME): string {
  if (c === null) return dash;
  const pct = (x: number) => Math.max(1, Math.round(Math.abs(x) * 100));
  if (c.low <= 0 && c.high >= 0) return `same (±${pct(Math.max(-c.low, c.high))}%)`;
  const word = c.median > 0 ? words.up : words.down;
  return `${pct(c.median)}% ${word} (±${pct((c.high - c.low) / 2)}%)`;
}

/** `2× faster` / `1.5× more` from a median ratio (above 1: v13 needs less). */
function factorIn(speed: number | null, words: Words): string {
  if (speed === null) return dash;
  return speed >= 1 ? `${round(speed, 1)}× ${words.down}` : `${round(1 / speed, 1)}× ${words.up}`;
}

/** One table per environment that ran: a row per diagram, a column per comparison. */
function compareLines(cmp: Comparison, style: '**' | '###'): string[] {
  const out: string[] = [];
  for (const [name, env] of [
    ['Browser', cmp.browser],
    ['Node', cmp.node],
  ] as const) {
    if (!env) continue;
    const has = (id: RendererId) =>
      env.renderers.some((r) => r.renderer === id && r.error === undefined);
    if (!has('v13')) continue;
    const series = (diagram: string, id: RendererId) => env.warm[diagram]?.[id] ?? [];
    const v12 = has('v12-frozen');
    const v12Rounds = v12
      ? Math.max(
          ...cmp.diagrams.map((d) => series(d.id, 'v12-frozen').filter((x) => x !== null).length)
        )
      : 0;
    const columns = [
      ...(has('v13-base') ? ['vs base'] : []),
      ...(v12 ? ['vs mermaid@12.2.0'] : []),
      ...(has('pele') ? ['vs Pele'] : []),
    ];
    const counted = env.metric === 'instructions';
    const words = counted ? INSTRUCTIONS : TIME;
    const rounds = counted
      ? `CPU instructions per render, ${env.rounds} repeats`
      : `${env.rounds} rounds${v12 ? `; mermaid@12 in ${v12Rounds}` : ''}`;
    const v13Cell = (xs: (number | null)[]) => {
      const m = medianOf(xs);
      if (!counted) return ms(m);
      return m === null ? dash : `${round(m / 1e6, 1)} M`;
    };
    out.push(
      style === '**' ? `**${name}** (${rounds})` : `${style} ${name} (${rounds})`,
      '',
      row(['Diagram', 'v13', ...columns]),
      row(Array<string>(2 + columns.length).fill('---')),
      ...cmp.diagrams.map((d) => {
        const v13 = series(d.id, 'v13');
        return row([
          d.label,
          v13Cell(v13),
          ...(has('v13-base')
            ? [changeCell(pairedChange(v13, series(d.id, 'v13-base')), words)]
            : []),
          ...(v12 ? [factorIn(medianSpeedup(v13, series(d.id, 'v12-frozen')), words)] : []),
          ...(has('pele') ? [factorIn(medianSpeedup(v13, series(d.id, 'pele')), words)] : []),
        ]);
      }),
      ''
    );
    for (const r of env.renderers)
      if (r.error !== undefined) out.push(`- ${r.renderer} failed in ${name}: ${r.error}`, '');
  }
  return out;
}

interface TableColumn {
  id: RendererId;
  /** Header of the ratio column. */
  ratio: string;
  /** Show the columns even when the renderer did not run (the R-PERF-3 baseline). */
  always?: boolean;
}

/** Per-diagram table of v13 (with v13-stages columns) and the warm time of each comparison. */
function diagramsTable(runs: RendererRun[], comparisons: TableColumn[]): string[] {
  const find = (id: RendererId) => runs.find((r) => r.renderer === id);
  const byId = (r: RendererRun | undefined) => new Map((r?.results ?? []).map((x) => [x.id, x]));
  const v13ById = byId(find('v13'));
  const stageById = byId(find('v13-stages'));
  const shown = comparisons
    .map((c) => ({ ...c, run: find(c.id) }))
    .filter((c) => c.always === true || c.run?.status === 'ready')
    .map((c) => ({ ...c, byId: byId(c.run) }));
  const okWarm = (x: DiagramResult | undefined) => (x?.status === 'ok' ? x.warmMs : null);
  const ratio = (against: number | null, r: DiagramResult | undefined) =>
    r?.warmMs && against ? `${round(against / r.warmMs, 1)}×` : dash;
  const ids = (find('v13') ?? find('v13-stages') ?? shown[0]?.run)?.results.map((r) => r.id) ?? [];

  const out = [
    row([
      'Diagram',
      'Set',
      'Status',
      'First',
      'Warm',
      'p95',
      ...STAGES.map(capital),
      ...shown.flatMap((c) => [`${c.id} warm`, c.ratio]),
    ]),
    row(Array<string>(6 + STAGES.length + shown.length * 2).fill('---')),
  ];
  for (const id of ids) {
    const r = v13ById.get(id);
    const st = stageById.get(id)?.stages;
    out.push(
      row([
        id,
        r?.set ?? shown.map((c) => c.byId.get(id)?.set).find(Boolean) ?? dash,
        r?.status ?? dash,
        num(r?.firstMs),
        num(r?.warmMs),
        num(r?.p95Ms),
        ...STAGES.map((s) => num(st?.[s])),
        ...shown.flatMap((c) => {
          const w = okWarm(c.byId.get(id));
          return [num(w), ratio(w, r)];
        }),
      ])
    );
  }
  out.push('');
  return out;
}

/** The Node environment's renderer summary. Reported only. */
function nodeSummaryLines(report: BenchReport, node: NodeRuns, h: Heading): string[] {
  const runs = node.renderers;
  const common = commonIds(runs);
  // speedup() reads `renderers`; point it at the Node runs.
  const asReport: BenchReport = { ...report, renderers: runs };
  const hasBase = runs.some((r) => r.renderer === 'v13-base' && r.status === 'ready');
  const out: string[] = [`${h} Node`, ''];
  out.push(
    `Runtime \`${node.runtime}\`. Each renderer runs in its own child process and is timed to the SVG string: no document and no layout, so these times are not comparable with the browser's. mermaid@12 needs a DOM and does not run here. Pele measures text with its built-in Arial table in Node, and with a canvas in the browser. Nothing here is gated.`,
    ''
  );
  out.push(
    `Σ columns and the geomean use the ${common.size} diagrams every ready renderer rendered.`,
    ''
  );
  out.push(
    row([
      'Renderer',
      'Version',
      'Init',
      'Counts',
      'Σ warm (common)',
      'Σ first (common)',
      ...(hasBase ? ['vs v13-base (geomean)'] : []),
    ]),
    row(Array<string>(hasBase ? 7 : 6).fill('---'))
  );
  const notes: string[] = [];
  for (const r of runs) {
    const s = hasBase ? speedup(asReport, r.renderer, 'v13-base').value : null;
    out.push(
      row([
        r.renderer,
        r.version,
        ms(r.initMs, 1),
        counts(r.results),
        ms(sum(r.results, common, 'warmMs')),
        ms(sum(r.results, common, 'firstMs')),
        ...(hasBase ? [s === null ? dash : `${s}×`] : []),
      ])
    );
    if (r.error) notes.push(`- ${r.renderer}: ${r.error}`);
  }
  out.push('', ...notes, ...(notes.length > 0 ? [''] : []));
  return out;
}
