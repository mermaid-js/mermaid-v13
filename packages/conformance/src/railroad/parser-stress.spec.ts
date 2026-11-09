import { describe, expect, it } from 'vitest';
import { parseRailroad } from '@mermaid-js/diagram-railroad';

/**
 * R-PARSE-7, pitfalls 5 and 11: the four railroad parsers, value conversion, duplicate checks,
 * AST ids and recovery included, are linear in input size. v12's accDescr converter
 * (`/\s+$/gm`) is quadratic on a long blank run inside a line. Same frame as
 * `../packet/parser-stress.spec.ts`: n and 8n units, bar 24x (linear ~8x, quadratic ~64x), this
 * thread's CPU time, best of five, the small input run until it takes at least {@link MIN_MS}
 * and the large one an eighth as often, compared per run. Not measured on a steady machine: the
 * bar is a ratio.
 */
const IR = 'railroad-beta\n';
const E = 'railroad-ebnf-beta\n';
const A = 'railroad-abnf-beta\n';
const P = 'railroad-peg-beta\n';
const SHAPES: [string, (n: number) => string][] = [
  ['blanks inside an accDescr block line', (n) => `${E}accDescr {a${' '.repeat(n)}b}`],
  ['blank runs in a title', (n) => `${IR}title a${'  b'.repeat(n / 3)}`],
  ['escapes in a string', (n) => `${IR}a = terminal("${'\\n'.repeat(n / 2)}") ;`],
  ['IR rules', (n) => IR + 'a = terminal("x") ;\n'.repeat(n / 20)],
  [
    'IR one long sequence',
    (n) => `${IR}a = sequence(${'terminal("x"), '.repeat(n / 15)}terminal("y")) ;`,
  ],
  [
    'IR one long choice',
    (n) => `${IR}a = choice(${'nonterminal("x"), '.repeat(n / 18)}terminal("y")) ;`,
  ],
  [
    'IR nesting to the limit, again and again',
    (n) => IR + `a = ${'optional('.repeat(90)}terminal("x")${')'.repeat(90)} ;\n`.repeat(n / 1000),
  ],
  ['IR nesting past the limit', (n) => `${IR}a = ${'sequence('.repeat(n / 9)}terminal("x") ;`],
  ['EBNF one long sequence', (n) => `${E}a = ${'b , '.repeat(n / 4)}c ;`],
  ['EBNF one long choice', (n) => `${E}a = ${'"b" | '.repeat(n / 6)}c ;`],
  ['EBNF postfixes stacked past the limit', (n) => `${E}a = b${'?'.repeat(n)} ;`],
  ['EBNF groups nested past the limit', (n) => `${E}a = ${'( '.repeat(n / 2)}b ;`],
  ['EBNF exceptions', (n) => `${E}a = ${'b - c '.repeat(n / 6)};`],
  ['ABNF repeats', (n) => `${A}a = ${'1*3b '.repeat(n / 5)};`],
  ['ABNF alternatives over lines', (n) => `${A}a = b\n${'  / %x41-5A\n'.repeat(n / 13)};`],
  ['PEG predicates', (n) => `${P}A <- ${'!b &"c" '.repeat(n / 8)};`],
  ['PEG suffixes', (n) => `${P}A <- ${'b* c+ d? '.repeat(n / 9)};`],
  ['duplicate rules', (n) => P + 'A <- "x" ;\n'.repeat(n / 11)],
  ['an error in every rule', (n) => IR + 'a = foo ;\n'.repeat(n / 10)],
  ['a missing ; in every rule', (n) => E + 'a = b\n'.repeat(n / 6)],
  ['stray characters', (n) => `${A}a = "x" ;\n${'@'.repeat(n)}`],
  ['title lines among the rules', (n) => P + 'A <- "x" ;\ntitle t\n'.repeat(n / 19)],
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
/**
 * The step of {@link cpuMs}: the median of 20 changes seen while spinning. About 1 µs on macOS;
 * on Linux `threadCpuUsage` (`getrusage(RUSAGE_THREAD)`) only moves when the scheduler books
 * the running thread's time, at each tick or switch, and steps by 4 ms on the hosted CI runner.
 */
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

describe('stress: the railroad parsers are linear in input size', () => {
  it.each(SHAPES)(
    '%s',
    (_name, build) => {
      const small = build(4_000);
      const large = build(32_000);
      parseRailroad(large); // warm up
      const reps = repeatsFor(() => parseRailroad(small));
      // The large input is 8 times the small one: an eighth of the runs keeps its window as long.
      const repsLarge = Math.max(1, reps / 8);
      let tSmall = Infinity;
      let tLarge = Infinity;
      for (let round = 0; round < 5; round++) {
        tSmall = Math.min(
          tSmall,
          cost(() => parseRailroad(small), reps)
        );
        tLarge = Math.min(
          tLarge,
          cost(() => parseRailroad(large), repsLarge)
        );
      }
      // A reading of 0 means the clock did not move: a broken measurement, not a fast parse.
      expect(tSmall, `${reps} small runs read 0 ms (MIN_MS ${MIN_MS})`).toBeGreaterThan(0);
      expect(tLarge / repsLarge / (tSmall / reps)).toBeLessThan(24);
    },
    60_000
  );
});
