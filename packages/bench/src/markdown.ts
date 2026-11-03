/** Markdown rendering of a bench report: summary, gates and the per-diagram table. */
import type { GateOutcome } from './gates.ts';
import { speedup } from './gates.ts';
import type { BenchReport, DiagramResult, NodeRuns, RendererId, RendererRun } from './report.ts';
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
    `Runner \`${report.runner}\`${report.browser ? `, ${report.browser}` : ''}${report.node ? `, ${report.node.runtime}` : ''}${report.commit ? `, commit \`${report.commit}\`` : ''}.`,
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
/** GitHub rejects comments over 65 536 characters; keep a margin. */
const COMMENT_LIMIT = 60_000;
/** A warm-time change below this is noise for a single CI run. */
const CHANGE_THRESHOLD = 0.1;
const CHANGES_SHOWN = 5;

/** The diagrams whose v13 warm time moved most against v13-base, in one environment. */
function changesLines(runs: RendererRun[], env: string, h: Heading): string[] {
  const find = (id: RendererId) => runs.find((r) => r.renderer === id && r.status === 'ready');
  const now = find('v13');
  const then = find('v13-base');
  if (!now || !then) return [];
  const okWarm = (x: DiagramResult | undefined) =>
    x?.status === 'ok' && x.warmMs !== null && x.warmMs > 0 ? x.warmMs : null;
  const before = new Map(then.results.map((r) => [r.id, okWarm(r)]));
  const pairs = now.results.flatMap((r) => {
    const a = before.get(r.id) ?? null;
    const b = okWarm(r);
    return a === null || b === null ? [] : [{ id: r.id, then: a, now: b, change: b / a - 1 }];
  });
  const slower = pairs
    .filter((p) => p.change > CHANGE_THRESHOLD)
    .sort((x, y) => y.change - x.change);
  const faster = pairs
    .filter((p) => p.change < -CHANGE_THRESHOLD)
    .sort((x, y) => x.change - y.change);
  const pct = (c: number) => `${c > 0 ? '+' : ''}${Math.round(c * 100)}%`;
  const out = [
    `${h} Largest changes vs v13-base (${env})`,
    '',
    `Warm medians of ${pairs.length} diagrams: ${slower.length} more than ${CHANGE_THRESHOLD * 100}% slower, ${faster.length} more than ${CHANGE_THRESHOLD * 100}% faster. Sub-millisecond diagrams are noisy in a single run.`,
    '',
  ];
  const shown = [...slower.slice(0, CHANGES_SHOWN), ...faster.slice(0, CHANGES_SHOWN)];
  if (shown.length > 0)
    out.push(
      row(['Diagram', 'v13-base warm', 'v13 warm', 'Change']),
      row(Array<string>(4).fill('---')),
      ...shown.map((p) => row([p.id, num(p.then), num(p.now), pct(p.change)])),
      ''
    );
  return out;
}

const details = (summary: string, lines: string[]) => [
  `<details><summary>${summary}</summary>`,
  '',
  ...lines,
  '</details>',
  '',
];

export interface CommentOptions {
  /** Link to the CI run whose artifact holds the full report. */
  runUrl?: string;
  maxChars?: number;
}

/**
 * The PR comment: the verdict, gates, renderer summaries of both environments and the largest
 * changes against the base branch. Per-diagram tables are folded, and dropped (pointing at the
 * full report) when they would take the comment over GitHub's size limit.
 */
export function formatComment(
  report: BenchReport,
  outcome: GateOutcome,
  options: CommentOptions = {}
): string {
  const failed = outcome.gates.filter((g) => g.status === 'fail' && g.enforced);
  const warned = outcome.gates.filter((g) => g.status === 'fail' && !g.enforced);
  const verdict =
    failed.length > 0
      ? `${failed.length} gate${failed.length === 1 ? '' : 's'} failed (${failed.map((g) => g.requirement).join(', ')})`
      : `gates pass${warned.length > 0 ? `, ${warned.length} reported only (${warned.map((g) => g.requirement).join(', ')})` : ''}`;
  const full = options.runUrl
    ? `Full report: the \`bench-report\` artifact of [this run](${options.runUrl}).`
    : 'Full report: the `bench-report` artifact of this run.';
  const head = [
    COMMENT_MARKER,
    `## Bench: ${verdict}`,
    '',
    ...headerLines(report),
    ...gatesLines(outcome, '###'),
    ...browserRenderersLines(report, '###'),
    ...changesLines(report.renderers, 'browser', '###'),
    ...(report.node
      ? [
          ...nodeSummaryLines(report, report.node, '###'),
          ...changesLines(report.node.renderers, 'Node', '###'),
        ]
      : []),
  ];
  const folded = [
    ...details('Per-diagram times (browser)', browserDiagramsLines(report)),
    ...(report.node ? details('Per-diagram times (Node)', nodeDiagramsLines(report.node)) : []),
  ];
  const limit = options.maxChars ?? COMMENT_LIMIT;
  const withTables = [...head, ...folded, full].join('\n');
  if (withTables.length <= limit) return withTables;
  return [...head, 'Per-diagram tables are left out to fit the comment size limit.', full].join(
    '\n'
  );
}

interface Comparison {
  id: RendererId;
  /** Header of the ratio column. */
  ratio: string;
  /** Show the columns even when the renderer did not run (the R-PERF-3 baseline). */
  always?: boolean;
}

/** Per-diagram table of v13 (with v13-stages columns) and the warm time of each comparison. */
function diagramsTable(runs: RendererRun[], comparisons: Comparison[]): string[] {
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
