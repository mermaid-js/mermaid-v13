/**
 * CI gates over a bench report (R-PERF-1, -3, -4, -7, -9; R-ASCII-9; R-TEST-7).
 *
 * While the v13 render pipeline is missing the gates run in `report` mode: they are computed and
 * printed but never fail the job. `auto` switches to `enforce` as soon as `mermaid` renders.
 */
import type {
  Baseline,
  BenchReport,
  DiagramResult,
  PipelineState,
  RendererId,
  Stage,
} from './report.ts';
import { STAGES, rendererRun } from './report.ts';
import { geomean, round } from './stats.ts';

export const LIMITS = {
  /** R-PERF-1: core + flowchart as loaded for a flowchart render, gzip bytes. */
  loadedGzipBytes: 80 * 1024,
  /** R-PERF-3: warm geomean speedup over frozen mermaid@12.2.0 with dagre. */
  minSpeedup: 50,
  /** R-PERF-7: a stage may get at most this much slower than the stored baseline. */
  maxStageRatio: 1.1,
  /** R-PERF-9 (Should): ms from navigation start until the first render is possible. */
  readyAtMs: 15,
  /**
   * R-ASCII-9 / D87: what a text render of one diagram type loads on top of its SVG render
   * (`core/ascii` plus that type's ascii entry), gzip bytes, for the largest type. Kept apart
   * from R-PERF-1, which never loads it.
   * A soft budget (D87): the `ascii-size` gate reports it and never fails the job.
   */
  asciiGzipBytes: 15 * 1024,
} as const;

export type GateMode = 'report' | 'enforce';
export type GateModeSetting = GateMode | 'auto';
export type GateId = 'size' | 'speed' | 'ok-count' | 'stage-regression' | 'ready-at' | 'ascii-size';
export type GateStatus = 'pass' | 'fail' | 'skip';

export interface GateResult {
  id: GateId;
  title: string;
  requirement: string;
  level: 'must' | 'should';
  status: GateStatus;
  /** True when a failure of this gate fails the job. */
  enforced: boolean;
  actual: number | null;
  limit: number;
  detail: string;
}

export interface GateOutcome {
  mode: GateMode;
  gates: GateResult[];
  exitCode: 0 | 1;
}

export interface GateInput {
  report: BenchReport;
  /** The stored baseline for `report.runner`, if there is one. */
  baseline: Baseline | undefined;
  mode: GateMode;
  /** Gates computed and printed but never failing the job, whatever the mode. */
  reportOnly?: readonly GateId[];
  /** Number of diagrams in the flowchart corpus (the OK count must equal it). */
  corpusSize: number;
  /** Corpus diagrams rendered, when counted elsewhere than the browser runs (the PR check). */
  corpusOk?: number;
  /** Gates not measured by this run, with the reason: reported as skipped, never failing. */
  skip?: Partial<Record<GateId, string>>;
}

export function resolveMode(setting: GateModeSetting, pipeline: PipelineState): GateMode {
  if (setting !== 'auto') return setting;
  return pipeline.present ? 'enforce' : 'report';
}

const okWarm = (r: DiagramResult): r is DiagramResult & { warmMs: number } =>
  r.status === 'ok' && r.warmMs !== null && r.warmMs > 0;

/** Warm geomean of `time(against) / time(renderer)` over diagrams both rendered (the common set). */
export function speedup(
  report: BenchReport,
  renderer: RendererId = 'v13',
  against: RendererId = 'v12-frozen'
): { value: number | null; common: number } {
  const base = new Map(
    (rendererRun(report, against)?.results ?? []).filter(okWarm).map((r) => [r.id, r.warmMs])
  );
  const ratios: number[] = [];
  for (const r of (rendererRun(report, renderer)?.results ?? []).filter(okWarm)) {
    const b = base.get(r.id);
    if (b !== undefined) ratios.push(b / r.warmMs);
  }
  const g = geomean(ratios);
  return { value: g === null ? null : round(g), common: ratios.length };
}

/** Per stage, the geomean of `current / baseline` over diagrams timed in both. */
export function stageRatios(
  report: BenchReport,
  baseline: Baseline
): Partial<Record<Stage, number>> {
  const out: Partial<Record<Stage, number>> = {};
  const results = (rendererRun(report, 'v13-stages')?.results ?? []).filter(
    (r) => r.status === 'ok'
  );
  for (const stage of STAGES) {
    const ratios: number[] = [];
    for (const r of results) {
      const now = r.stages[stage];
      const then = baseline.stages[r.id]?.[stage];
      if (now !== null && now > 0 && then !== undefined && then > 0) ratios.push(now / then);
    }
    const g = geomean(ratios);
    if (g !== null) out[stage] = round(g, 3);
  }
  return out;
}

const kb = (bytes: number) => `${round(bytes / 1024, 1)} KB`;

function stageStatus(compared: number, regressed: number): GateStatus {
  if (compared === 0) return 'skip';
  return regressed > 0 ? 'fail' : 'pass';
}

export function evaluateGates({
  report,
  baseline,
  mode,
  reportOnly = [],
  corpusSize,
  corpusOk,
  skip = {},
}: GateInput): GateOutcome {
  const v13 = rendererRun(report, 'v13');
  const enforces = (id: GateId) => mode === 'enforce' && !reportOnly.includes(id);
  const gates: GateResult[] = [];

  const size = v13?.size ?? null;
  gates.push({
    id: 'size',
    title: 'Loaded size, core + flowchart (gzip)',
    requirement: 'R-PERF-1',
    level: 'must',
    status: size !== null && size.gzip <= LIMITS.loadedGzipBytes ? 'pass' : 'fail',
    enforced: enforces('size'),
    actual: size?.gzip ?? null,
    limit: LIMITS.loadedGzipBytes,
    detail:
      size === null
        ? 'no size measured'
        : `${kb(size.gzip)} ${size.source === 'loaded' ? 'fetched by the runner' : 'static import closure'} (limit ${kb(LIMITS.loadedGzipBytes)})`,
  });

  const s = speedup(report);
  gates.push({
    id: 'speed',
    title: 'Warm geomean vs mermaid@12.2.0 dagre',
    requirement: 'R-PERF-3',
    level: 'must',
    status: s.value !== null && s.value >= LIMITS.minSpeedup ? 'pass' : 'fail',
    enforced: enforces('speed'),
    actual: s.value,
    limit: LIMITS.minSpeedup,
    detail:
      s.value === null
        ? 'no diagram rendered in both v13 and v12-frozen'
        : `${s.value}× over ${s.common} common diagrams (need ≥ ${LIMITS.minSpeedup}×)`,
  });

  const ok =
    corpusOk ?? (v13?.results ?? []).filter((r) => r.set === 'corpus' && r.status === 'ok').length;
  gates.push({
    id: 'ok-count',
    title: 'Corpus diagrams rendered',
    requirement: 'R-PERF-4',
    level: 'must',
    status: ok === corpusSize ? 'pass' : 'fail',
    enforced: enforces('ok-count'),
    actual: ok,
    limit: corpusSize,
    detail: `${ok}/${corpusSize} rendered`,
  });

  if (baseline === undefined) {
    gates.push({
      id: 'stage-regression',
      title: 'Stage regression vs stored baseline',
      requirement: 'R-PERF-7',
      level: 'must',
      status: 'skip',
      enforced: false,
      actual: null,
      limit: LIMITS.maxStageRatio,
      detail: `no baseline stored for runner "${report.runner}"`,
    });
  } else {
    const ratios = stageRatios(report, baseline);
    const entries = Object.entries(ratios) as [Stage, number][];
    const worst = entries.reduce<[Stage, number] | undefined>(
      (w, e) => (w && w[1] >= e[1] ? w : e),
      undefined
    );
    const regressed = entries.filter(([, r]) => r > LIMITS.maxStageRatio);
    gates.push({
      id: 'stage-regression',
      title: 'Stage regression vs stored baseline',
      requirement: 'R-PERF-7',
      level: 'must',
      status: stageStatus(entries.length, regressed.length),
      enforced: enforces('stage-regression') && entries.length > 0,
      actual: worst?.[1] ?? null,
      limit: LIMITS.maxStageRatio,
      detail:
        entries.length === 0
          ? 'no stage timings to compare'
          : entries.map(([stage, r]) => `${stage} ×${r}`).join(', ') +
            (regressed.length > 0 ? ` — regressed: ${regressed.map(([st]) => st).join(', ')}` : ''),
    });
  }

  const ready = v13?.readyAtMs ?? null;
  gates.push({
    id: 'ready-at',
    title: '"Ready at"',
    requirement: 'R-PERF-9 (Should)',
    level: 'should',
    status: ready !== null && ready <= LIMITS.readyAtMs ? 'pass' : 'fail',
    enforced: false,
    actual: ready === null ? null : round(ready, 1),
    limit: LIMITS.readyAtMs,
    detail:
      ready === null
        ? 'v13 did not become ready'
        : `${round(ready, 1)} ms (target ≤ ${LIMITS.readyAtMs} ms)`,
  });

  const ascii = report.asciiSize ?? null;
  gates.push({
    id: 'ascii-size',
    title: 'ASCII chunks, core/ascii + the largest diagram ascii entry (gzip)',
    requirement: 'R-ASCII-9',
    // D87: the budget is soft. Measured and reported; it never fails the job.
    level: 'should',
    status: ascii !== null && ascii.gzip <= LIMITS.asciiGzipBytes ? 'pass' : 'fail',
    enforced: false,
    actual: ascii?.gzip ?? null,
    limit: LIMITS.asciiGzipBytes,
    detail:
      ascii === null
        ? 'no ascii size measured'
        : `${kb(ascii.gzip)} in ${ascii.files.length} chunk(s) an SVG render never loads (limit ${kb(LIMITS.asciiGzipBytes)})`,
  });

  for (const g of gates) {
    const reason = skip[g.id];
    if (reason === undefined) continue;
    Object.assign(g, { status: 'skip', enforced: false, actual: null, detail: reason });
  }
  const exitCode = gates.some((g) => g.enforced && g.status === 'fail') ? 1 : 0;
  return { mode, gates, exitCode };
}
