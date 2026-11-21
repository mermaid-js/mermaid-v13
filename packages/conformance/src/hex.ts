/**
 * A colour as the exact hex the specs compare (D71).
 */
import { formatColor, parseColor } from '@mermaid-js/core/theme';

/**
 * `v` as exact hex, or `orElse(v)` where it is no colour: `undefined` by default. A spec that
 * wants to see the value it could not read passes `String`.
 */
export function hex<T, F>(v: T, orElse: (v: T) => F): string | F;
export function hex(v: unknown): string | undefined;
export function hex(v: unknown, orElse: (v: unknown) => unknown = () => undefined): unknown {
  const rgba = typeof v === 'string' ? parseColor(v) : undefined;
  return rgba ? formatColor(rgba) : orElse(v);
}
