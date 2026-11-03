/**
 * The timing loop both environments use: the browser page (`harness.ts`) and the Node child
 * process (`node/runner.ts`). Only `renderOnce` differs: the page also puts the SVG in the
 * document and forces layout, Node stops at the SVG string. No DOM or Node APIs here.
 */
import type { Stage } from '../report.ts';
import { STAGES } from '../report.ts';
import type { Adapter } from './adapters.ts';
import type { RenderReply } from './protocol.ts';

// Timers are coarse (about 0.1 ms in a browser), and v13 renders tiny diagrams well under that,
// so each warm sample times a batch of renders sized to last at least 2 ms.
const MIN_SAMPLE_MS = 2;
const MAX_BATCH = 500;

export interface SampleOptions {
  /** Renders `source` once and returns the elapsed ms. Throws when the renderer fails. */
  renderOnce(source: string): Promise<number>;
  adapter: Adapter;
  errorText(e: unknown): string;
  /** Runs after every attempt, failed or not (the page clears its stage). */
  cleanup?(): void;
}

/** A cold render, a probe that sizes the batch, then warm samples until reps or the budget. */
export async function sample(
  o: SampleOptions,
  source: string,
  reps: number,
  budgetMs: number
): Promise<RenderReply> {
  try {
    const firstMs = await o.renderOnce(source);
    let batch = 1;
    if (reps > 0) {
      const probe = await o.renderOnce(source);
      if (probe < MIN_SAMPLE_MS)
        batch = Math.min(MAX_BATCH, Math.ceil(MIN_SAMPLE_MS / Math.max(probe, 0.02)));
    }
    const samples: number[] = [];
    const stageSamples: Partial<Record<Stage, number[]>> = {};
    let spent = 0;
    for (let i = 0; i < reps; i++) {
      // Always take at least one warm sample; then stop once the budget is spent.
      if (i > 0 && spent > budgetMs) break;
      o.adapter.takeStages?.();
      const t0 = performance.now();
      for (let b = 0; b < batch; b++) await o.renderOnce(source);
      const elapsed = performance.now() - t0;
      samples.push(elapsed / batch);
      spent += elapsed;
      const st = o.adapter.takeStages?.() ?? {};
      for (const s of STAGES) {
        const v = st[s];
        if (v !== undefined) (stageSamples[s] ??= []).push(v / batch);
      }
    }
    return { ok: true, firstMs, samples, batch, stageSamples };
  } catch (e) {
    return { ok: false, error: o.errorText(e) };
  } finally {
    o.cleanup?.();
  }
}
