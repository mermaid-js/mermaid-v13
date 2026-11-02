/**
 * R-PARSE-7: preprocess is linear in its input. Each shape is timed at n and 4n; linear
 * predicts ~4x, quadratic ~16x, and the bar sits at 8x; the best of three measurements
 * counts, so machine noise cannot fail it.
 * Shapes include the ones that are quadratic in v12 (`regexes.spec.ts`) and unclosed input.
 */
import { describe, expect, it } from 'vitest';
import { preprocess } from './index.ts';

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

/** Enough repetitions for the small input to take about 8 ms, so the clock's 1 ms step is noise. */
const repsFor = (run: () => unknown): number => {
  let reps = 1;
  for (;;) {
    const t0 = Date.now();
    for (let r = 0; r < reps; r++) run();
    if (Date.now() - t0 >= 8 || reps >= 1024) return reps;
    reps *= 2;
  }
};

const lines = (n: number, line: (i: number) => string) =>
  Array.from({ length: n }, (_, i) => line(i)).join('');

const SHAPES: [string, (n: number) => string][] = [
  [
    'huge front matter',
    (n) => '---\n' + lines(n, (i) => `k${i}: value ${i}\n`) + '---\ngraph TD\n',
  ],
  [
    'huge nested front matter',
    (n) =>
      '---\nconfig:\n' +
      lines(n, (i) => `  k${i}:\n    x: [1, {b: 'two'}]\n    y: |\n      text\n`) +
      '---\n',
  ],
  ['unclosed fence', (n) => '---\n' + 'title: x\n'.repeat(n)],
  ['blank lines after an opener (v12 quadratic shape)', (n) => '---\n' + ' \n'.repeat(n)],
  [
    'unclosed flow collection in front matter',
    (n) => '---\na: {\n' + ' b: 1,\n'.repeat(n) + '---\n',
  ],
  ['unclosed quoted value in front matter', (n) => '---\na: "' + 'x \n'.repeat(n) + '---\n'],
  ['many directives', (n) => '%%{init: {"theme": "dark"}}%%\n'.repeat(n)],
  ['many unclosed directives', (n) => '%%{init: {"a": 1}\n'.repeat(n)],
  ['one huge directive', (n) => '%%{init: {"a": [' + '1,'.repeat(n) + '1]}}%%'],
  ['all whitespace', (n) => ('\n' + ' '.repeat(4)).repeat(n)],
  ['`%%` runs without a newline', (n) => '%%' + 'x%%'.repeat(n)],
];

describe('preprocess runs in linear time', () => {
  it.each(SHAPES)('%s', (_name, build) => {
    const small = build(5_000);
    const large = build(20_000);
    const reps = repsFor(() => preprocess(small));
    // Load on the machine only ever slows a run, so a ratio under the bar on any of three
    // measurements proves linearity; quadratic input stays near 16x on every one of them.
    let ratio = Infinity;
    let tLarge = Infinity;
    for (let attempt = 0; attempt < 3 && ratio >= 8; attempt++) {
      const tSmall = fastest(() => preprocess(small), reps);
      tLarge = fastest(() => preprocess(large), reps);
      ratio = Math.min(ratio, tLarge / Math.max(tSmall, 1));
    }
    expect(ratio).toBeLessThan(8);
    // An absolute guard too: one 20k-line input stays far below a second on any CI machine.
    expect(tLarge / reps).toBeLessThan(250);
  });
});
