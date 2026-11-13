/**
 * Readers of config values a diagram cannot trust the type of: the config resolver checks no
 * value types, so a directive can set any of them. Every `diagram-*` package used to carry
 * copies of these; where the copies differed, the difference is a parameter. A subpath of its
 * own, so that only diagram chunks load it (DESIGN §2).
 */

/**
 * A number, or a string as `Number` reads it (a blank one only with `blank`, where it is 0),
 * else NaN. Not checked for finiteness.
 */
export function rawConfigNumber(value: unknown, blank = false): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && (blank || value.trim() !== '')) return Number(value);
  return Number.NaN;
}

/**
 * {@link rawConfigNumber} when it is finite and at least `min`, capped at `max`; else undefined.
 */
export function configNumber(
  value: unknown,
  min = -Infinity,
  max = Infinity,
  blank = false
): number | undefined {
  const n = rawConfigNumber(value, blank);
  return Number.isFinite(n) && n >= min ? Math.min(n, max) : undefined;
}

/**
 * How a diagram reads its `useMaxWidth`: `not-false` scales unless it is `false`; `truthy`
 * scales when it is unset or truthy (v12's `configureSvgSize`); `boolean` takes a boolean and
 * reads anything else as `fallback`, telling `invalid` when it was set.
 */
export type UseMaxWidthPolicy = 'not-false' | 'truthy' | 'boolean';

export function useMaxWidth(
  value: unknown,
  policy: UseMaxWidthPolicy = 'not-false',
  fallback = true,
  invalid?: (given: unknown) => void
): boolean {
  if (policy === 'not-false') return value !== false;
  if (policy === 'truthy') return value === undefined || Boolean(value);
  if (typeof value === 'boolean') return value;
  if (value !== undefined) invalid?.(value);
  return fallback;
}
