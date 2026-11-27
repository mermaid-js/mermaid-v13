/**
 * The PR check: what a pull request needs from the bench, in about two minutes.
 *
 * - Size (R-PERF-1, R-ASCII-9): from the build and the browser run.
 * - Corpus renders (R-PERF-4): every corpus diagram rendered once in Node by the production
 *   bundle (v13 is DOM-free), no timing.
 * - v13 against its base branch and compare: CPU instruction counts in Node (`instruction-counts.ts`),
 *   steady to about 1% on a shared runner, where times vary by ±10-40%. Reported, never gating.
 * - A small browser run: v13 and Mermaid 12 on the same 5 diagrams, one session each, for
 *   "Ready at" (R-PERF-9) and an indicative speed against Mermaid 12.
 *
 * The full browser timing bench (corpus speed against Mermaid 12 for R-PERF-3, compare, stages)
 * runs nightly and at release (`cli/bench.ts`).
 */
import { pathToFileURL } from 'node:url';
import type { Fixture } from './fixtures.ts';
import type { InstructionRun, NamedDiagram } from './instruction-counts.ts';
import { stripMermaidOnlyConfig } from './normalize.ts';
import type { PipelineState, RendererRun, SizeSummary } from './report.ts';

/** One scaling series (7, 50, 500 nodes) and two feature-heavy diagrams. */
export const PR_DIAGRAMS: NamedDiagram[] = [
  { id: 'compare/flowchart-7', label: 'Small (7 nodes)' },
  { id: 'compare/flowchart-50', label: 'Medium (50 nodes)' },
  { id: 'compare/flowchart-500', label: 'Large (500 nodes)' },
  { id: 'perf/medium3', label: 'Subgraphs and edge labels' },
  {
    id: 'pr-check/12-should-render-a-flowchart-with-long-names-and-class-definitions',
    label: 'Long labels and classes',
  },
];

export interface CorpusCheck {
  ok: number;
  total: number;
  failures: { id: string; error: string }[];
}

const LIFTED = { maxTextSize: 10_000_000, maxEdges: 1_000_000 };

/** Renders every fixture once with the bundle at `entry` (in this process) and counts the OK ones. */
export async function corpusInNode(entry: string, fixtures: Fixture[]): Promise<CorpusCheck> {
  const mod = (await import(pathToFileURL(entry).href)) as {
    render: (id: string, text: string) => Promise<{ svg?: string } | string>;
    initialize?: (config: Record<string, unknown>) => void;
  };
  mod.initialize?.(LIFTED);
  const failures: CorpusCheck['failures'] = [];
  for (const [i, f] of fixtures.entries()) {
    try {
      const r = await mod.render(`c${i}`, stripMermaidOnlyConfig(f.source).source);
      const svg = typeof r === 'string' ? r : (r.svg ?? '');
      if (!svg.includes('<svg')) failures.push({ id: f.id, error: 'no <svg> in the output' });
    } catch (e) {
      failures.push({ id: f.id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { ok: fixtures.length - failures.length, total: fixtures.length, failures };
}

export interface PrReport {
  schema: 1;
  createdAt: string;
  runner: string;
  /** The commit the check is for (on a PR, its head). */
  commit?: string;
  /** What was built when that is not `commit` (on a PR, the merge with the base). */
  mergeCommit?: string;
  base?: { ref: string; version?: string; error?: string };
  pipeline: PipelineState;
  browser?: string;
  node: string;
  /** Static-import closure of the production bundle, gzip bytes, for v13 and the base. */
  staticGzip: { v13: number; base?: number };
  asciiSize: SizeSummary | null;
  /** Gzip bytes of each diagram type's text path. */
  asciiSizeByType: Readonly<Record<string, number>>;
  /** Browser runs of v13 and Mermaid 12 on the PR diagrams. */
  renderers: RendererRun[];
  corpus: CorpusCheck;
  /** Absent when this machine cannot count instructions; then `instructionsSkipped` says why. */
  instructions?: InstructionRun;
  instructionsSkipped?: string;
}
