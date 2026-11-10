import { beforeAll, describe, expect, it } from 'vitest';
import { createTheme, loadTheme, type Theme } from '@mermaid-js/core/theme';
import { layoutC4, type C4Model } from '@mermaid-js/diagram-c4';
import { c4TestContext, parsedC4 } from '@mermaid-js/diagram-c4/testing';
import type { ResolvedConfig } from '@mermaid-js/core/config';

/**
 * R-SEC-5, D455: the C4 layout's work is bounded. The router and the label placement count the
 * comparisons they make, and once 2,000,000 are spent the relations left go straight and their
 * labels sit at their middle, so past the budget the layout is linear in the diagram's size, and
 * the slowest careful case (long relations across a grid, just under Pele's old up-front estimate
 * `rels · (elements + boundaries + 3·rels) ≤ 2,000,000` at the large size) costs no more than its
 * budget. Shape from `./stress.spec.ts` (#531): n and 8n elements; linear is ~8x, quadratic
 * ~64x, and the bar is 24x. Times are this thread's CPU time, best of five, of the layout alone
 * (each source parsed once), the small layout repeated until it takes at least `MIN_MS`. Not
 * measured on a steady machine.
 */
const C = 'C4Context\n';
/** A shape: its name, its source for n elements, n for the small size, and whether it is past the budget there. */
const SHAPES: [string, (n: number) => string, number, boolean][] = [
  [
    'elements in a row, each related to the next',
    (n) => {
      let s = C;
      for (let i = 0; i < n; i++)
        s += `System(s${i}, "S${i}", "about s${i}")\nRel(s${i}, s${(i + 1) % n}, "next", "HTTP")\n`;
      return s;
    },
    1_000,
    true,
  ],
  [
    'elements in boundaries, related across them',
    (n) => {
      const groups = n / 10;
      let s = C;
      for (let b = 0; b < groups; b++) {
        s += `Boundary(b${b}, "B${b}") {\n`;
        for (let i = 0; i < 10; i++) s += `Container(c${b}_${i}, "C")\n`;
        s += '}\n';
      }
      for (let b = 0; b < groups; b++)
        for (let i = 0; i < 10; i++) s += `Rel(c${b}_${i}, c${(b + 1) % groups}_${i}, "x")\n`;
      return s;
    },
    1_000,
    true,
  ],
  [
    'nested boundaries',
    (n) => C + 'Boundary(b, "B") {\nSystem(s, "S")\n'.repeat(n / 10) + '}\n'.repeat(n / 10),
    1_000,
    false,
  ],
  [
    // 800 elements and 560 relations at the large size: 560 · (800 + 1,680) = 1,388,800.
    'long relations across a grid, under the old estimate',
    (n) => {
      let s = C;
      for (let i = 0; i < n; i++) s += `System(s${i}, "S${i}")\n`;
      const rels = (n * 7) / 10;
      for (let i = 0; i < rels; i++)
        s += `Rel(s${(i * 37) % n}, s${(i * 101 + 13) % n}, "r${i}")\n`;
      return s;
    },
    100,
    false,
  ],
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

let theme: Theme;
beforeAll(async () => {
  theme = createTheme(await loadTheme('default'));
});

describe('stress: the C4 layout is linear in diagram size past the router budget', () => {
  it.each(SHAPES)(
    '%s',
    (_name, build, n, pastBudget) => {
      const parse = (src: string): [C4Model, ResolvedConfig] => {
        const { model, config } = parsedC4(src);
        return [model, config];
      };
      const [small, smallConfig] = parse(build(n));
      const [large, largeConfig] = parse(build(8 * n));
      const lay = (model: C4Model, config: ResolvedConfig) =>
        layoutC4(model, c4TestContext(config, theme));
      // Past the budget at both sizes: the relations left go straight.
      if (pastBudget) expect(lay(small, smallConfig).careful).toBe(false);
      lay(large, largeConfig); // warm up
      const reps = repeatsFor(() => lay(small, smallConfig));
      const repsLarge = Math.max(1, reps / 8);
      let tSmall = Infinity;
      let tLarge = Infinity;
      for (let round = 0; round < 5; round++) {
        tSmall = Math.min(
          tSmall,
          cost(() => lay(small, smallConfig), reps)
        );
        tLarge = Math.min(
          tLarge,
          cost(() => lay(large, largeConfig), repsLarge)
        );
      }
      expect(tSmall, `${reps} small runs read 0 ms (MIN_MS ${MIN_MS})`).toBeGreaterThan(0);
      expect(tLarge / repsLarge / (tSmall / reps)).toBeLessThan(24);
    },
    120_000
  );
});
