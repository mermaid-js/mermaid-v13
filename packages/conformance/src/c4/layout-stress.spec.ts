import { beforeAll, describe, expect, it } from 'vitest';
import { createTheme, loadTheme, type Theme } from '@mermaid-js/core/theme';
import { layoutC4, type C4Model } from '@mermaid-js/diagram-c4';
import { c4TestContext, parsedC4 } from '@mermaid-js/diagram-c4/testing';
import type { ResolvedConfig } from '@mermaid-js/core/config';

/**
 * R-SEC-5, D455: the C4 layout stays linear in the diagram's size once the router's budget
 * (2,000,000 box comparisons) is spent: relations then go straight and labels sit at their
 * middle. Shape from `./stress.spec.ts` (#531): n and 8n elements, each with a relation;
 * linear is ~8x, quadratic ~64x, and the bar is 24x. Times are this thread's CPU time, best of
 * five, of the layout alone (each source parsed once). Not measured on a steady machine.
 */
const C = 'C4Context\n';
const SHAPES: [string, (n: number) => string][] = [
  [
    'elements in a row, each related to the next',
    (n) => {
      let s = C;
      for (let i = 0; i < n; i++)
        s += `System(s${i}, "S${i}", "about s${i}")\nRel(s${i}, s${(i + 1) % n}, "next", "HTTP")\n`;
      return s;
    },
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
  ],
  [
    'nested boundaries',
    (n) => C + 'Boundary(b, "B") {\nSystem(s, "S")\n'.repeat(n / 10) + '}\n'.repeat(n / 10),
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
    (_name, build) => {
      const parse = (src: string): [C4Model, ResolvedConfig] => {
        const { model, config } = parsedC4(src);
        return [model, config];
      };
      const [small, smallConfig] = parse(build(1_000));
      const [large, largeConfig] = parse(build(8_000));
      const lay = (model: C4Model, config: ResolvedConfig) =>
        layoutC4(model, c4TestContext(config, theme));
      // Past the budget: no steering (a diagram with no relations has none to spend it on).
      if (small.relations.length > 0) expect(lay(small, smallConfig).careful).toBe(false);
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
