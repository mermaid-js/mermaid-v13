/**
 * Gantt's layout work (R-SEC-5, D542): the steps scheduling and the exclude ranges take, counted
 * against core's `maxLayoutWork` limit. A step is one calendar day walked for excluded days (in
 * the schedule, on every pass, and when the layout draws the exclude ranges); a day is checked
 * against the chart's `dateFormat` too, so it counts once per 10 characters of a longer format.
 * Deterministic: steps, never the clock (D270).
 */
import { LimitError, MAX_STEPS } from '@mermaid-js/core/limits';

/** Characters of `dateFormat` one step covers: `YYYY-MM-DD` and shorter make a day one step. */
const FORMAT_CHARS_PER_STEP = 10;

/** What one walked day costs with `dateFormat`. */
export const dayCost = (dateFormat: string): number =>
  Math.max(1, Math.ceil(dateFormat.trim().length / FORMAT_CHARS_PER_STEP));

export class Steps {
  /** Steps taken so far. */
  taken = 0;

  constructor(readonly max: number = MAX_STEPS) {}

  /** Take `n` more steps; past the limit, the render's `LIMIT` error. */
  take(n: number): void {
    this.taken += n;
    if (this.taken <= this.max) return;
    throw new LimitError(
      'maxLayoutWork',
      this.max,
      this.taken,
      `The gantt chart's schedule needs more than ${this.max} steps (it had taken ${this.taken} when it stopped): every day a task spans is walked for its excluded days, on each pass. Shorten the long tasks or drop the excludes; the limit is set by the page or app that renders the diagram (limits.maxLayoutWork).`
    );
  }
}
