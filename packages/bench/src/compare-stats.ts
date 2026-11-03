/**
 * Statistics of the comparison. Values are paired by round (both renderers ran in that round's
 * fresh sessions), so what a round shares cancels out of the ratio.
 */

/** Log of `a / b` for every round where both rendered. */
function logRatios(a: readonly (number | null)[], b: readonly (number | null)[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const x = a[i];
    const y = b[i];
    if (x !== null && x !== undefined && y !== null && y !== undefined && x > 0 && y > 0)
      out.push(Math.log(x / y));
  }
  return out;
}

function median(xs: readonly number[]): number {
  const s = [...xs].sort((p, q) => p - q);
  const m = s.length >> 1;
  return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Deterministic PRNG (mulberry32), so a report's intervals are reproducible. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Change {
  /** Median relative change of `a` against `b`: 0.05 is 5% slower, -0.05 5% faster. */
  median: number;
  /** 95% bootstrap interval of that median. */
  low: number;
  high: number;
  rounds: number;
}

/** Fewer paired rounds than this give no interval worth showing. */
export const MIN_ROUNDS = 5;
const RESAMPLES = 2000;

/** How `a`'s time changed against `b`'s, over the rounds both ran, with a 95% interval. */
export function pairedChange(
  a: readonly (number | null)[],
  b: readonly (number | null)[]
): Change | null {
  const logs = logRatios(a, b);
  if (logs.length < MIN_ROUNDS) return null;
  const next = prng(0x5eed);
  const medians: number[] = [];
  for (let k = 0; k < RESAMPLES; k++) {
    const sample = Array.from(
      { length: logs.length },
      () => logs[Math.floor(next() * logs.length)]!
    );
    medians.push(median(sample));
  }
  medians.sort((p, q) => p - q);
  const at = (q: number) => Math.expm1(medians[Math.floor(q * (RESAMPLES - 1))]!);
  return { median: Math.expm1(median(logs)), low: at(0.025), high: at(0.975), rounds: logs.length };
}

/** Median of `b / a` over the rounds both ran (above 1: `a` is faster), or null. */
export function medianSpeedup(
  a: readonly (number | null)[],
  b: readonly (number | null)[]
): number | null {
  const logs = logRatios(b, a);
  return logs.length === 0 ? null : Math.exp(median(logs));
}

/** Median of the rounds that have a value, or null. */
export function medianOf(xs: readonly (number | null)[]): number | null {
  const v = xs.filter((x): x is number => x !== null);
  return v.length === 0 ? null : median(v);
}
