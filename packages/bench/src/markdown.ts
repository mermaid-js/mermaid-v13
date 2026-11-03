/** Markdown rendering of a bench report: summary, gates and the per-diagram table. */
import type { GateOutcome } from './gates.ts';
import { speedup } from './gates.ts';
import type { BenchReport, DiagramResult, RendererRun } from './report.ts';
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
function commonIds(report: BenchReport): Set<string> {
  const ready = report.renderers.filter((r) => r.status === 'ready');
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

export function formatMarkdown(report: BenchReport, outcome: GateOutcome): string {
  const common = commonIds(report);
  const out: string[] = [];
  out.push(`# Bench report ${report.createdAt}`, '');
  out.push(
    `Runner \`${report.runner}\`${report.browser ? `, ${report.browser}` : ''}${report.commit ? `, commit \`${report.commit}\`` : ''}.`
  );
  out.push(
    `Pipeline ${report.pipeline.present ? 'present' : 'missing'}: ${report.pipeline.reason}.`,
    ''
  );

  out.push(
    `## Gates: ${outcome.mode}${outcome.mode === 'report' ? ' (computed, never fail the job)' : ''}`,
    ''
  );
  out.push(
    row(['Requirement', 'Gate', 'Status', 'Enforced', 'Detail']),
    row(['---', '---', '---', '---', '---'])
  );
  for (const g of outcome.gates)
    out.push(row([g.requirement, g.title, g.status, g.enforced ? 'yes' : 'no', g.detail]));
  out.push('');

  const baseRun = rendererRun(report, 'v13-base');
  const hasBase = baseRun?.status === 'ready';
  out.push('## Renderers', '');
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
    row(Array(hasBase ? 10 : 9).fill('---'))
  );
  const notes: string[] = [];
  const times = (v: number | null) => (v === null ? dash : `${v}×`);
  for (const r of report.renderers) {
    const s = speedup(report, r.renderer, 'v12-frozen').value;
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
        times(s),
        ...(hasBase ? [times(speedup(report, r.renderer, 'v13-base').value)] : []),
      ])
    );
    if (r.error) notes.push(`- ${r.renderer}: ${r.error}`);
  }
  out.push('', ...notes, ...(notes.length > 0 ? [''] : []));

  const v13 = rendererRun(report, 'v13');
  const stages = rendererRun(report, 'v13-stages');
  const frozen = rendererRun(report, 'v12-frozen');
  const byId = (r: RendererRun | undefined) => new Map((r?.results ?? []).map((x) => [x.id, x]));
  const stageById = byId(stages);
  const frozenById = byId(frozen);
  const baseById = byId(hasBase ? baseRun : undefined);
  const peleRun = rendererRun(report, 'pele');
  const hasPele = peleRun?.status === 'ready';
  const peleById = byId(hasPele ? peleRun : undefined);
  const ids = (v13 ?? stages ?? frozen)?.results.map((r) => r.id) ?? [];
  const okWarm = (x: DiagramResult | undefined) => (x?.status === 'ok' ? x.warmMs : null);
  const ratio = (against: number | null, r: DiagramResult | undefined) =>
    r?.warmMs && against ? `${round(against / r.warmMs, 1)}×` : dash;

  out.push('## Diagrams', '');
  out.push(
    'Times are per render. Stage columns are medians from the instrumented `v13-stages` build. "Speedup" and "vs …" are that renderer\'s warm time over v13\'s (above 1× means v13 is faster).',
    ''
  );
  out.push(
    row([
      'Diagram',
      'Set',
      'Status',
      'First',
      'Warm',
      'p95',
      ...STAGES.map(capital),
      'v12-frozen warm',
      'Speedup',
      ...(hasBase ? ['v13-base warm', 'vs base'] : []),
      ...(hasPele ? ['pele warm', 'vs pele'] : []),
    ]),
    row(Array(12 + (hasBase ? 2 : 0) + (hasPele ? 2 : 0)).fill('---'))
  );
  const v13ById = byId(v13);
  for (const id of ids) {
    const r = v13ById.get(id);
    const st = stageById.get(id)?.stages;
    const f = frozenById.get(id);
    const speed =
      r?.warmMs && f?.status === 'ok' && f.warmMs ? `${round(f.warmMs / r.warmMs, 1)}×` : dash;
    out.push(
      row([
        id,
        r?.set ?? f?.set ?? dash,
        r?.status ?? dash,
        num(r?.firstMs),
        num(r?.warmMs),
        num(r?.p95Ms),
        ...STAGES.map((s) => num(st?.[s])),
        num(f?.status === 'ok' ? f.warmMs : null),
        speed,
        ...(hasBase ? [num(okWarm(baseById.get(id))), ratio(okWarm(baseById.get(id)), r)] : []),
        ...(hasPele ? [num(okWarm(peleById.get(id))), ratio(okWarm(peleById.get(id)), r)] : []),
      ])
    );
  }
  out.push('');

  const unsupported = report.unsupported ?? [];
  if (unsupported.length > 0) {
    out.push('## Not run: no v13 package for the type', '');
    out.push(row(['Diagram', 'Set', 'Type']), row(Array(3).fill('---')));
    for (const u of unsupported) out.push(row([u.id, u.set, u.type]));
    out.push('');
  }
  return out.join('\n');
}
