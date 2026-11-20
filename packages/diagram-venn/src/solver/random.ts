/**
 * The venn solver's fixed seed (D413). The constrained MDS start of four or more sets draws from
 * `seededRandom(VENN_SEED)` (`@mermaid-js/shared/random`) in place of venn.js's `Math.random`, so
 * one input always gives one layout (R-ARCH-6).
 */

/** The seed every solve starts from. */
export const VENN_SEED = 0x2f6b_5a1d;
