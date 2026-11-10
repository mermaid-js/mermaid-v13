/**
 * The timing harness of the "linear in input size" stress specs (R-PARSE-7, pitfall 5), after
 * #531's packet specs: the ratio of per-run CPU times of a small input and a larger one, robust
 * to a loaded runner and to a coarse CPU clock. Bars and sizes stay in the specs; this only
 * measures.
 *
 * - Times are this thread's CPU time, so time spent waiting for a core does not count.
 * - Every measurement is a window of repeated runs at least {@link minWindowMs} long: 2 ms, or
 *   three steps of the CPU clock where it is coarser. On Linux `threadCpuUsage` only moves when
 *   the scheduler books the thread's time, in steps of 4 ms on the hosted CI runner, so one
 *   small run of a few ms read 0 or 4 ms; with the old 2 ms floor on a single run that made a
 *   linear lexer read 25.8 against the bar of 24. A window three steps or more long reads within
 *   a step, a third, of its length, so a linear 8x reads at most 8 × (4/3) / (2/3) = 16 and a
 *   quadratic 64x at least 64 × (2/3) / (4/3) = 32: the usual bar of 24 still sits between them.
 * - Five rounds alternate the small and large windows, and each side keeps its best. A window
 *   shorter than the minimum doubles that side's runs and starts its five again, so the
 *   calibration costs no extra windows.
 *   A window that reads 0 (the clock did not move) is one of those, never a fast run.
 */

/** CPU ms of this thread (the process on Node versions without threadCpuUsage). */
function cpuMs(): number {
  const u =
    typeof process.threadCpuUsage === 'function' ? process.threadCpuUsage() : process.cpuUsage();
  return (u.user + u.system) / 1000;
}

/** CPU ms of `reps` runs of `run`. */
function cost(run: () => unknown, reps: number): number {
  const t0 = cpuMs();
  for (let k = 0; k < reps; k++) run();
  return cpuMs() - t0;
}

/**
 * The step of {@link cpuMs}: the median of 20 changes seen while spinning. About 1 µs on macOS;
 * about 4 ms for `threadCpuUsage` on the hosted CI runner.
 */
function clockStepMs(): number {
  const steps: number[] = [];
  let last = cpuMs();
  while (steps.length < 20) {
    const now = cpuMs();
    if (now !== last) steps.push(now - last);
    last = now;
  }
  return steps.sort((a, b) => a - b)[10]!;
}

let minMs: number | undefined;
/** The shortest window: 2 ms, or three clock steps where the clock is coarser. */
function minWindowMs(): number {
  return (minMs ??= Math.max(2, 3 * clockStepMs()));
}

/** One side of a ratio: its runs per window, and its best window over `rounds` long ones. */
interface Side {
  run: () => unknown;
  reps: number;
  best: number;
  rounds: number;
}

/** Measures one window of `side`; a short one doubles its runs and starts its rounds again. */
function measure(side: Side): void {
  const ms = cost(side.run, side.reps);
  if (ms < minWindowMs()) {
    side.reps *= 2;
    side.best = Infinity;
    side.rounds = 0;
    return;
  }
  side.best = Math.min(side.best, ms);
  side.rounds++;
}

/**
 * Per-run CPU time of `large` over that of `small`. Every stress spec uses an input 8 times the
 * size: linear reads about 8, quadratic about 64. Both run once
 * unmeasured first. With a `log` label it writes the per-run times to stdout, to size a shape.
 */
export function linearRatio(small: () => unknown, large: () => unknown, log?: string): number {
  small(); // warm up
  large();
  const sides: [Side, Side] = [
    { run: small, reps: 1, best: Infinity, rounds: 0 },
    { run: large, reps: 1, best: Infinity, rounds: 0 },
  ];
  while (sides.some((s) => s.rounds < 5))
    for (const side of sides) if (side.rounds < 5) measure(side);
  const [s, l] = sides;
  const [perSmall, perLarge] = [s.best / s.reps, l.best / l.reps];
  if (log !== undefined)
    process.stdout.write(`${log}: ${perSmall.toFixed(2)} ms, ${perLarge.toFixed(2)} ms per run\n`);
  return perLarge / perSmall;
}
