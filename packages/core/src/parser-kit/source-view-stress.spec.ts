/**
 * `cook` on a long plain range scans at a regex's speed a character, not a JavaScript loop's: a
 * 20,000-deep tree view cooks 200 million characters of indentation, and a check that looped
 * over every character made its parse three times slower. Each range is timed against a regex
 * scan of the same range (the check `cook` made before it had a loop), a ratio of two timings in
 * one process: the regex path measures about 1x, the loop over every character hundreds of times
 * that under the test runner, and the bar sits at 2.5x. The best of five measurements counts.
 */
import { describe, expect, it } from 'vitest';
import { cook, sourceView } from './index.ts';

/** Fastest of `trials` timings of `reps` runs, in ms (Date.now: core has no Node types). */
const fastest = (run: () => unknown, reps: number, trials = 5): number => {
  let best = Infinity;
  for (let t = 0; t < trials; t++) {
    const t0 = Date.now();
    for (let r = 0; r < reps; r++) run();
    best = Math.min(best, Date.now() - t0);
  }
  return best;
};

const N = 4_000_000;

describe('cook on a long range', () => {
  it.each([
    ['blanks', ' '.repeat(N), false],
    ['blanks, braceNewline', ' '.repeat(N), true],
    ['words', 'ab cd efgh '.repeat(N / 10), true],
  ])('%s: within 2.5x of a regex scan', (_, src, braceNewline) => {
    const view = sourceView(src, 0, [], { braceNewline });
    expect(cook(src, 1, src.length, view)).toBe(src.slice(1));
    const re = braceNewline ? /[\r#}]/ : /[\r#]/;
    const scan = fastest(() => re.test(src.slice(1)), 48);
    const cooked = fastest(() => cook(src, 1, src.length, view), 48);
    // Both at least a few ms, so the clock's 1 ms step does not decide.
    expect(cooked / Math.max(scan, 2)).toBeLessThan(2.5);
  });
});
