import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { lexClass } from '@mermaid-js/diagram-class';

/**
 * Class lexer stress cases (R-PARSE-7, pitfalls.md 5): one per free-text state and per scan
 * that could go quadratic. Each shape is lexed at n and 4n: linear predicts about 4x,
 * quadratic about 16x, and the bar is 8x. As in core's `preprocess/stress.spec.ts`, a timing is
 * the fastest of five runs of enough repetitions to take 8 ms, and up to five ratios are taken:
 * load only ever slows a run, so one ratio under the bar shows linearity, while quadratic input
 * stays near 16x on every one.
 */

/**
 * A lex slower than this is quadratic (the large input lexes in about 80 ms when linear):
 * no more trials are taken, so a regression fails in seconds instead of minutes.
 */
const SLOW_MS = 2_000;

/** Fastest of `trials` timings of `reps` lexes, in ms; one trial past {@link SLOW_MS} ends them. */
function fastest(src: string, reps: number, trials = 5): number {
  let best = Infinity;
  for (let t = 0; t < trials; t++) {
    const t0 = performance.now();
    for (let r = 0; r < reps; r++) lexClass(src);
    const ms = performance.now() - t0;
    best = Math.min(best, ms);
    if (ms / reps > SLOW_MS) break;
  }
  return best;
}

/** Enough repetitions for `src` to take about 8 ms, so clock and scheduling noise is small. */
function repsFor(src: string): number {
  for (let reps = 1; ; reps *= 2) {
    const t0 = performance.now();
    for (let r = 0; r < reps; r++) lexClass(src);
    if (performance.now() - t0 >= 8 || reps >= 1024) return reps;
  }
}

/** The best of up to five large/small ratios, stopping once one is under the bar. */
function ratio(make: (n: number) => string, n = 20_000): number {
  const small = make(n);
  const large = make(4 * n);
  const reps = repsFor(small);
  let best = Infinity;
  for (let attempt = 0; attempt < 5 && best >= 8; attempt++) {
    const tLarge = fastest(large, reps);
    best = Math.min(best, tLarge / Math.max(fastest(small, reps), 1e-3));
    if (tLarge / reps > SLOW_MS) break;
  }
  return best;
}

describe('class lexer stays linear (R-PARSE-7)', () => {
  it.each<[string, (n: number) => string]>([
    ['blanks before a line break', (n) => 'classDiagram\n' + ' '.repeat(n) + '\nA'],
    ['blanks with no line break', (n) => 'classDiagram\nA' + ' '.repeat(n) + 'B'],
    ['many direction words on a line', (n) => 'classDiagram\n' + 'direction x '.repeat(n / 10)],
    ['tokens on a line with direction', (n) => 'classDiagram\nA ' + 'b '.repeat(n) + 'direction'],
    ['a long class body line', (n) => 'classDiagram\nclass A {\n' + 'x'.repeat(n) + '\n}'],
    ['a string split by comment lines', (n) => 'classDiagram\nnote "' + 'a\n%% c\n'.repeat(n / 6)],
    ['runs of relation characters', (n) => 'classDiagram\nA ' + '<|--'.repeat(n / 4) + ' B'],
    ['entities', (n) => 'classDiagram\nA : ' + '#35;'.repeat(n / 4)],
  ])(
    '%s',
    (_, make) => {
      expect(ratio(make)).toBeLessThan(8);
    },
    60_000
  );
});
