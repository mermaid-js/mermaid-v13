/**
 * Per-stage timing for the bench (R-PERF-5, DESIGN §14), behind the `__MERMAID_BENCH__` build flag.
 *
 * The pipeline brackets each stage:
 *
 *     const t = stageStart();
 *     const ast = plugin.parse(body, ctx);
 *     stageEnd('parse', t);
 *
 * A production bundle defines `__MERMAID_BENCH__` as `false` and the minifier drops the clock
 * reads, the recording and the stage names. Unbundled code (tsc output, tests) sees the flag as
 * undefined, which also means off: a clock can then never be installed, so this module holds no
 * state outside bench builds. The bench defines the flag as `true` and installs a clock from its
 * runner. The clock is injected because core reads no host timers itself (R-ARCH-1, R-ARCH-7).
 */
declare const __MERMAID_BENCH__: boolean | undefined;

export type Stage = 'parse' | 'measure' | 'layout' | 'serialise';

export interface StageClock {
  now(): number;
  record(stage: Stage, ms: number): void;
}

/** True only in a bench build (`__MERMAID_BENCH__` defined as `true`). */
export const STAGE_TIMING: boolean =
  typeof __MERMAID_BENCH__ !== 'undefined' && __MERMAID_BENCH__ === true;

let clock: StageClock | undefined;
// For each stage that has started and not ended, the time of the stages that ran inside it: a
// stage records its own time, without theirs (flowchart's `measure` inside core's `layout`, D203).
const inner: number[] = [];

/** Installs (or with `undefined`, removes) the bench clock. Does nothing outside bench builds. */
export function installStageClock(next: StageClock | undefined): void {
  if (!STAGE_TIMING) return;
  clock = next;
  inner.length = 0;
}

/** Start of a stage; pass the result to `stageEnd`. Returns 0 when timing is off. */
export function stageStart(): number {
  if (!STAGE_TIMING || !clock) return 0;
  inner.push(0);
  return clock.now();
}

/** End of a stage started with `stageStart`. */
export function stageEnd(stage: Stage, start: number): void {
  if (!STAGE_TIMING || !clock) return;
  const elapsed = clock.now() - start;
  clock.record(stage, elapsed - (inner.pop() ?? 0));
  if (inner.length > 0) inner[inner.length - 1]! += elapsed;
}
