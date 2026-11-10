/**
 * The C4 stress specs' CPU-time measure (#531's pattern, R-PARSE-7, pitfall 5): this thread's
 * CPU time, the clock's step, and the repeats that make a small measurement long enough for a
 * ratio of per-run times to sit well above that step. Never an absolute bound. Shared by
 * `stress.spec.ts`, `parser-stress.spec.ts`, `layout-stress.spec.ts`, `render-stress.spec.ts`
 * and `ascii-stress.spec.ts`.
 */

/** CPU ms of this thread (the process on Node versions without threadCpuUsage). */
export const cpuMs = (): number => {
  const u =
    typeof process.threadCpuUsage === 'function' ? process.threadCpuUsage() : process.cpuUsage();
  return (u.user + u.system) / 1000;
};

/** CPU ms of `reps` runs of `run`. */
export const cost = (run: () => unknown, reps: number): number => {
  const t0 = cpuMs();
  for (let k = 0; k < reps; k++) run();
  return cpuMs() - t0;
};

/**
 * The step of {@link cpuMs}: the median of 20 changes seen while spinning. About 1 µs on macOS;
 * on Linux `threadCpuUsage` (the kernel's per-thread CPU counter) only moves when the scheduler books
 * the running thread's time, at each tick or switch, and steps by 4 ms on the hosted CI runner.
 */
export const clockStepMs = (): number => {
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
export const MIN_MS = Math.max(8, 10 * clockStepMs());

/** How many runs of `run` take at least {@link MIN_MS}, in each of three samples. */
export const repeatsFor = (run: () => unknown): number => {
  let reps = 1;
  while (![0, 1, 2].every(() => cost(run, reps) >= MIN_MS)) reps *= 2;
  return reps;
};
