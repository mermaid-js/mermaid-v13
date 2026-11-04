/**
 * The bench report: what one run of the harness produced, as JSON. Gates, the markdown
 * table and stored baselines are all derived from it.
 */
import type { FixtureSet } from './fixtures.ts';

export const STAGES = ['parse', 'measure', 'layout', 'serialise'] as const;
export type Stage = (typeof STAGES)[number];
export type StageTimes = Record<Stage, number | null>;

/**
 * - `v13`: the production bundle (timing compiled out); its warm time is what R-PERF-3 compares.
 * - `v13-stages`: the same code built with the bench flag, for per-stage columns (R-PERF-5).
 * - `v13-base`: the production bundle of the base commit (`--base`, default
 *   `origin/mermaid-v13`), so a PR is compared with the branch it merges into. Informational.
 * - `v12-frozen`: `mermaid@12.2.0` with `layout: 'dagre'`, the R-PERF-3 baseline.
 * - `v12-current`: the newest `mermaid@12` with its own default layout, reported for information.
 * - `pele`: the newest `pele@1` (Obsidian's Mermaid renderer), reported for information.
 */
export type RendererId = 'v13' | 'v13-stages' | 'v13-base' | 'v12-frozen' | 'v12-current' | 'pele';

export type ResultStatus = 'ok' | 'error' | 'timeout' | 'missing';

export interface DiagramResult {
  id: string;
  set: FixtureSet;
  status: ResultStatus;
  error?: string;
  /** Cold render: the first render of this diagram in the page. */
  firstMs: number | null;
  /** Median warm render. */
  warmMs: number | null;
  p95Ms: number | null;
  /** Renders per warm sample (tiny diagrams are batched to beat timer coarsening). */
  batch: number;
  samples: number;
  /** Median per-render time of each stage; null when the renderer has no stage timing. */
  stages: StageTimes;
}

export interface SizedFile {
  path: string;
  raw: number;
  gzip: number;
  brotli: number;
}

export interface SizeSummary {
  raw: number;
  gzip: number;
  brotli: number;
  /**
   * `loaded`: the files the runner page actually fetched before it could render.
   * `static`: the static-import closure of the entry, used when the renderer could not start.
   */
  source: 'loaded' | 'static';
  files: SizedFile[];
}

export type RendererStatus = 'ready' | 'init-error' | 'missing';

export interface RendererRun {
  renderer: RendererId;
  version: string;
  status: RendererStatus;
  error?: string;
  /** ms from navigation start until the renderer could render (warm HTTP cache). */
  readyAtMs: number | null;
  /** ms spent importing and initialising the renderer. */
  initMs: number | null;
  size: SizeSummary | null;
  results: DiagramResult[];
}

export interface PipelineState {
  /** True once `mermaid` exports a `render` that turns a two-node flowchart into an `<svg>`. */
  present: boolean;
  reason: string;
}

export interface BenchReport {
  schema: 1;
  createdAt: string;
  /** Baselines are stored per runner (O-4). */
  runner: string;
  /** The commit the report is for: `BENCH_COMMIT` (on a PR, its head), else HEAD. */
  commit?: string;
  /** What was built when that is not `commit`: on a PR, the merge of the PR into its base. */
  mergeCommit?: string;
  browser?: string;
  options: Record<string, unknown>;
  pipeline: PipelineState;
  /** Fixtures not run because their detected type has no v13 package. */
  unsupported?: UnsupportedFixture[];
  /**
   * What a text render of one diagram type loads that an SVG render never does (R-ASCII-9, D87),
   * from the build's import graph (`source: 'static'`): the largest type's path, which the gate
   * reads (per-type max, D130). Absent in reports older than M2.
   */
  asciiSize?: SizeSummary | null;
  /** Gzip bytes of each diagram type's text path (`asciiPaths`), so every type stays visible. */
  asciiSizeByType?: Readonly<Record<string, number>>;
  /** Browser runs (Chromium through Playwright); every gate reads these. */
  renderers: RendererRun[];
}

export interface UnsupportedFixture {
  id: string;
  set: FixtureSet;
  /** The type `detectType` returned. */
  type: string;
}

/** Stored per-stage medians for one runner (R-PERF-7). */
export interface Baseline {
  schema: 1;
  runner: string;
  createdAt: string;
  commit?: string;
  stages: Record<string, Partial<Record<Stage, number>>>;
}

export function emptyStages(): StageTimes {
  return { parse: null, measure: null, layout: null, serialise: null };
}

export function rendererRun(report: BenchReport, id: RendererId): RendererRun | undefined {
  return report.renderers.find((r) => r.renderer === id);
}

/** A baseline from the stage timings of a report; only diagrams that rendered are kept. */
export function baselineFrom(report: BenchReport): Baseline {
  const stages: Baseline['stages'] = {};
  for (const r of rendererRun(report, 'v13-stages')?.results ?? []) {
    if (r.status !== 'ok') continue;
    const entry: Partial<Record<Stage, number>> = {};
    for (const s of STAGES) {
      const v = r.stages[s];
      if (v !== null) entry[s] = v;
    }
    if (Object.keys(entry).length > 0) stages[r.id] = entry;
  }
  return {
    schema: 1,
    runner: report.runner,
    createdAt: report.createdAt,
    ...(report.commit !== undefined && { commit: report.commit }),
    stages,
  };
}
