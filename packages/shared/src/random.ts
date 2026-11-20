/**
 * A seeded generator for code that must not call `Math.random` (R-ARCH-6): the venn solver's
 * start (D413), and the seeded sources of the grammar tool and the conformance fuzzers.
 * Mulberry32 with its 32 bits of state wrapped on every step; uniform in [0, 1).
 *
 * Core's swimlane ordering keeps its own private copy, since core cannot import this package.
 */

/** A generator of numbers in [0, 1): the same sequence for the same seed (taken mod 2^32). */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b_79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}
