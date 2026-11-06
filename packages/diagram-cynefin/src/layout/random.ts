/**
 * v12's boundary randomness, ported exactly (`cynefinBoundaries.ts` :5-41, `mermaid@12.2.0`).
 * The numbers here are the PRNG's bit-mixing constants, not lengths, so the layout-literals
 * spec skips this file.
 */

/**
 * One mulberry32 step used as a hash: a value in [0, 1) for `seed`. Stateless, as in v12; the
 * `| 0` truncates a fractional seed and wraps it to int32.
 */
export function seededRandom(seed: number): number {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Java's `String.hashCode` (`h * 31 + c`, int32). It can return 0, which is then the seed. */
export function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

/**
 * The seed the boundaries are drawn with: a finite non-zero `seed` as it is, otherwise
 * `hashString(idPrefix)` (D362; v12 hashed the SVG element id).
 */
export function resolveSeed(seed: number, idPrefix: string): number {
  return Number.isFinite(seed) && seed !== 0 ? seed : hashString(idPrefix);
}
