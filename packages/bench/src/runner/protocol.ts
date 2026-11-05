/** Types shared by the Node driver and the in-page runner (`window.__bench`). */
import type { IdentityOutcome } from '../identity.ts';
import type { RendererId, Stage } from '../report.ts';

export interface RunnerOptions {
  /** Raise every renderer's input-size and edge limits so the large and huge tiers run. */
  liftLimits: boolean;
}

export interface ResourceEntry {
  name: string;
  decodedBodySize: number;
  transferSize: number;
}

export type ReadyInfo =
  | { ok: true; scriptStartAt: number; initMs: number; readyAt: number; resources: ResourceEntry[] }
  | { ok: false; missing: boolean; error: string };

export type RenderReply =
  | {
      ok: true;
      firstMs: number;
      /** Per-render ms; each sample is the mean over `batch` back-to-back renders. */
      samples: number[];
      batch: number;
      /** Per-render ms of each stage, one entry per warm sample; empty without stage timing. */
      stageSamples: Partial<Record<Stage, number[]>>;
    }
  | { ok: false; error: string };

export interface BenchWindow {
  renderer: RendererId;
  ready: Promise<ReadyInfo>;
  render(source: string, reps: number, budgetMs: number): Promise<RenderReply>;
  /** Renders `source` once as `id`, untimed and not inserted: the identity gate (D200). */
  renderSvg(source: string, id: string): Promise<IdentityOutcome>;
}

/** Where the server publishes each renderer and which file the adapter imports. */
export const RENDERER_ENTRY: Record<RendererId, string> = {
  v13: '/r/v13/index.js',
  'v13-stages': '/r/v13-stages/index.js',
  'v13-base': '/r/v13-base/index.js',
  'v12-frozen': '/r/v12-frozen/mermaid.esm.min.mjs',
  'v12-current': '/r/v12-current/mermaid.esm.min.mjs',
  pele: '/r/pele/pele.js',
};
