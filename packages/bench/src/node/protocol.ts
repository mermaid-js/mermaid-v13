/** Messages between the Node driver and its child runner (one process per renderer). */
import type { RendererId } from '../report.ts';
import type { RenderReply } from '../runner/protocol.ts';

export interface NodeRunnerArgs {
  renderer: RendererId;
  /** Absolute path of the ESM file the adapter imports. */
  entry: string;
  liftLimits: boolean;
}

export type NodeReady =
  | { ok: true; initMs: number }
  | { ok: false; missing: boolean; error: string };

export interface ToRunner {
  type: 'render';
  source: string;
  reps: number;
  budgetMs: number;
}

export type FromRunner =
  | { type: 'ready'; ready: NodeReady }
  | { type: 'result'; reply: RenderReply };
