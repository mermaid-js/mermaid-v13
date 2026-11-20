/**
 * The venn solver's fixed-seed generator (D413), in place of venn.js's `Math.random`: the
 * constrained MDS start of four or more sets draws from it, so one input always gives one
 * layout (R-ARCH-6). The generator is the shared one (`@mermaid-js/shared/random`).
 */
import { seededRandom as fromSeed } from '@mermaid-js/shared/random';

/** The seed every solve starts from. */
export const VENN_SEED = 0x2f6b_5a1d;

/** A generator of numbers in [0, 1), the same sequence for the same seed. */
export const seededRandom = (seed: number = VENN_SEED): (() => number) => fromSeed(seed);
