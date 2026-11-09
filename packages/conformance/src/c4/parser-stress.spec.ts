import { describe, expect, it } from 'vitest';
import { parseC4 } from '@mermaid-js/diagram-c4';

/**
 * R-PARSE-7 (#539): the C4 parser, model building included, is linear in the number of
 * statements, up to 16,000. Each shape is parsed with n and 8n statements (2,000 and 16,000);
 * linear is ~8x, quadratic ~64x, and the bar is 24x. Times are this thread's CPU time, best of
 * five, small and large parses alternating; the small parse repeats until it takes at least
 * {@link MIN_MS}, the large one an eighth as often (#531's pattern, `stress.spec.ts`). Not
 * measured on a steady machine: the bar is a ratio. v12's jison parser, with its DB's
 * `Array.find` per statement, is super-linear on the first shape.
 */
const C = 'C4Context\n';
const lines = (n: number, line: (k: number) => string): string =>
  Array.from({ length: n }, (_, k) => line(k)).join('\n');

const SHAPES: [string, (n: number) => string][] = [
  ['elements with distinct aliases', (n) => C + lines(n, (k) => `Person(p${k}, "P ${k}", "D")`)],
  ['one alias repeated (merges)', (n) => C + lines(n, (k) => `System(s, "S ${k}")`)],
  [
    'one alias repeated with a new name each time (extra)',
    (n) => C + lines(n, (k) => `System(s, "S", $k${k}="v")`),
  ],
  [
    'relations between distinct pairs',
    (n) =>
      C +
      lines(n / 2, (k) => `Person(p${k}, "P")`) +
      '\n' +
      lines(n / 2, (k) => `Rel(p${k}, p${(k * 7) % (n / 2)}, "uses", "HTTP")`),
  ],
  [
    'one relation repeated (merges)',
    (n) => C + 'Person(a, "A")\nPerson(b, "B")\n' + lines(n, (k) => `Rel(a, b, "r ${k}")`),
  ],
  [
    'relations to an unknown alias',
    (n) => C + 'Person(a, "A")\n' + lines(n, (k) => `Rel(a, x${k}, "r")`),
  ],
  [
    'boundaries side by side',
    (n) => C + lines(n / 3, (k) => `Boundary(b${k}, "B") {\nPerson(p${k}, "P")\n}`),
  ],
  [
    'boundaries nested deep',
    (n) =>
      C +
      lines(n / 2, (k) => `Boundary(b${k}, "B") {`) +
      '\nPerson(p, "P")\n' +
      '}\n'.repeat(n / 2),
  ],
  [
    'element styles on many targets',
    (n) =>
      C +
      lines(n / 2, (k) => `Person(p${k}, "P")`) +
      '\n' +
      lines(n / 2, (k) => `UpdateElementStyle(p${k}, $bgColor="grey", $fontColor="red")`),
  ],
  [
    'relation styles on many relations',
    (n) =>
      C +
      'Person(a, "A")\n' +
      lines(n / 2, (k) => `Person(p${k}, "P")\nRel(a, p${k}, "r")`) +
      '\n' +
      lines(n / 2, (k) => `UpdateRelStyle(a, p${k}, "red", "blue", "3", "x")`),
  ],
  [
    'layout configs',
    (n) => C + 'Person(a, "A")\n' + lines(n, (k) => `UpdateLayoutConfig("${k + 1}", "2")`),
  ],
  [
    'titles and accessibility',
    (n) => C + lines(n, (k) => (k % 2 ? `title T${k}` : `accDescr: D${k}`)) + '\nPerson(a, "A")',
  ],
  ['an error on every line', (n) => C + lines(n, (k) => `Person (p${k}, "P")`)],
  ['unclosed arguments on every line', (n) => C + lines(n, (k) => `Person(p${k}, "P"`)],
  ['a stray brace on every line', (n) => C + lines(n, () => `{`) + '\nPerson(a, "A")'],
  ['named arguments moved on every line', (n) => C + lines(n, (k) => `Person($descr="d${k}")`)],
  ['statements split by comment lines', (n) => C + lines(n, (k) => `Person(p${k}, "P")\n%% c`)],
];

/** CPU ms of this thread (the process on Node versions without threadCpuUsage). */
const cpuMs = (): number => {
  const u =
    typeof process.threadCpuUsage === 'function' ? process.threadCpuUsage() : process.cpuUsage();
  return (u.user + u.system) / 1000;
};
/** CPU ms of `reps` runs of `run`. */
const cost = (run: () => unknown, reps: number): number => {
  const t0 = cpuMs();
  for (let k = 0; k < reps; k++) run();
  return cpuMs() - t0;
};
/** The step of {@link cpuMs}: the median of 20 changes seen while spinning. */
const clockStepMs = (): number => {
  const steps: number[] = [];
  let last = cpuMs();
  while (steps.length < 20) {
    const now = cpuMs();
    if (now !== last) steps.push(now - last);
    last = now;
  }
  return steps.sort((a, b) => a - b)[10]!;
};
/** The shortest small measurement: 8 ms, or ten clock steps where the clock is coarser. */
const MIN_MS = Math.max(8, 10 * clockStepMs());
/** How many runs of `run` take at least {@link MIN_MS}, in each of three samples. */
const repeatsFor = (run: () => unknown): number => {
  let reps = 1;
  while (![0, 1, 2].every(() => cost(run, reps) >= MIN_MS)) reps *= 2;
  return reps;
};

describe('stress: the C4 parser is linear in the number of statements', () => {
  it.each(SHAPES)(
    '%s',
    (_name, build) => {
      const small = build(2_000);
      const large = build(16_000);
      parseC4(large); // warm up
      const reps = repeatsFor(() => parseC4(small));
      const repsLarge = Math.max(1, reps / 8);
      let tSmall = Infinity;
      let tLarge = Infinity;
      for (let round = 0; round < 5; round++) {
        tSmall = Math.min(
          tSmall,
          cost(() => parseC4(small), reps)
        );
        tLarge = Math.min(
          tLarge,
          cost(() => parseC4(large), repsLarge)
        );
      }
      expect(tSmall, `${reps} small runs read 0 ms (MIN_MS ${MIN_MS})`).toBeGreaterThan(0);
      expect(tLarge / repsLarge / (tSmall / reps)).toBeLessThan(24);
    },
    60_000
  );

  it('parses 16,000 statements into the model', () => {
    const r = parseC4(C + lines(16_000, (k) => `Person(p${k}, "P ${k}")`));
    expect(r.diagnostics).toEqual([]);
    expect(r.model.elements).toHaveLength(16_000);
    expect(r.ast.children).toHaveLength(16_000);
  });
});
