/** Markdown of a full bench report (release, nightly): summary, gates and per-diagram tables. */
import type { GateOutcome } from './gates.ts';
import { speedup } from './gates.ts';
import { dash, kb, ms, num, row, rule } from './md.ts';
import type { BenchReport, DiagramResult, RendererId, RendererRun } from './report.ts';
import { STAGES, rendererRun } from './report.ts';
import { round } from './stats.ts';

const capital = (s: string) => s[0]!.toUpperCase() + s.slice(1);
const times = (v: number | null) => (v === null ? dash : `${v}×`);

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

export function counts(results: DiagramResult[]): string {
  const n = (s: DiagramResult['status']) => results.filter((r) => r.status === s).length;
  return `${n('ok')}/${n('error')}/${n('timeout')}/${n('missing')}`;
}

function sum(results: DiagramResult[], common: Set<string>, key: 'warmMs' | 'firstMs') {
  const picked = results.filter((r) => common.has(r.id) && r[key] !== null);
  return picked.length === 0 ? null : picked.reduce((a, r) => a + r[key]!, 0);
}

function headerLines(report: BenchReport): string[] {
  const base = rendererRun(report, 'v13-base');
  return [
    `Runner \`${report.runner}\`${report.browser ? `, ${report.browser}` : ''}${report.commit ? `, commit \`${report.commit}\`` : ''}${report.mergeCommit ? ` (built as \`${report.mergeCommit}\`, its merge with the base branch)` : ''}.`,
    ...(base?.status === 'ready' && typeof report.options.base === 'string'
      ? [`v13-base is \`${report.options.base}\` = ${base.version}.`]
      : []),
    `Pipeline ${report.pipeline.present ? 'present' : 'missing'}: ${report.pipeline.reason}.`,
    '',
  ];
}

export function gatesLines(outcome: GateOutcome, h: '##' | '###'): string[] {
  return [
    `${h} Gates: ${outcome.mode}${outcome.mode === 'report' ? ' (computed, never fail the job)' : ''}`,
    '',
    row(['Requirement', 'Gate', 'Status', 'Enforced', 'Detail']),
    rule(5),
    ...outcome.gates.map((g) =>
      row([g.requirement, g.title, g.status, g.enforced ? 'yes' : 'no', g.detail])
    ),
    '',
  ];
}

function renderersLines(report: BenchReport): string[] {
  const common = commonIds(report.renderers);
  const hasBase = rendererRun(report, 'v13-base')?.status === 'ready';
  const out: string[] = ['## Renderers', ''];
  out.push(
    `Σ columns and the geomean use the ${common.size} diagrams every ready renderer rendered. Counts are ok/error/timeout/missing.`,
    '',
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
    rule(hasBase ? 10 : 9)
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
    rule(6 + STAGES.length + shown.length * 2),
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

function unsupportedLines(report: BenchReport): string[] {
  const unsupported = report.unsupported ?? [];
  if (unsupported.length === 0) return [];
  return [
    '## Not run: no v13 package for the type',
    '',
    row(['Diagram', 'Set', 'Type']),
    rule(3),
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
    ...renderersLines(report),
    '## Diagrams',
    '',
    'Times are per render. Stage columns are medians from the instrumented `v13-stages` build. "Speedup" and "vs …" are that renderer\'s warm time over v13\'s (above 1× means v13 is faster).',
    '',
    ...diagramsTable(report.renderers, [
      { id: 'v12-frozen', ratio: 'Speedup', always: true },
      { id: 'v13-base', ratio: 'vs base' },
      { id: 'pele', ratio: 'vs pele' },
    ]),
    ...unsupportedLines(report),
  ].join('\n');
}
