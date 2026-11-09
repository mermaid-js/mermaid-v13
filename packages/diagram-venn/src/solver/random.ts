/**
 * The venn solver's fixed-seed generator (D413), in place of venn.js's `Math.random`: the
 * constrained MDS start of four or more sets draws from it, so one input always gives one
 * layout (R-ARCH-6). Mulberry32: 32 bits of state, uniform in [0, 1).
 */

/** The seed every solve starts from. */
export const VENN_SEED = 0x2f6b_5a1d;

/** A generator of numbers in [0, 1), the same sequence for the same seed. */
export function seededRandom(seed: number = VENN_SEED): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b_79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}
