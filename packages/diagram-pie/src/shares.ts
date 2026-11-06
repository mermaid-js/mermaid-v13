/**
 * The sum pie shares are taken over (D226, never NaN), for the layout and the hover alike.
 * Every value is finite (the parser leaves out one that is not), but two of them can still add
 * up past the largest double: then each value is first divided by the largest one.
 */
export interface PieSum {
  /** What each value is divided by before it is summed: 1, or the largest value on overflow. */
  readonly unit: number;
  /** The sum of `value / unit` over every value. */
  readonly sum: number;
}

/**
 * The shares' sum: a value's share is `value / unit / sum`. With `unit` 1, the usual case, that
 * is v12's `value / sum` bit for bit.
 */
export function pieSum(values: readonly number[]): PieSum {
  let sum = 0;
  let largest = 0;
  for (const v of values) {
    sum += v;
    if (v > largest) largest = v;
  }
  if (Number.isFinite(sum)) return { unit: 1, sum };
  let scaled = 0;
  for (const v of values) scaled += v / largest;
  return { unit: largest, sum: scaled };
}
