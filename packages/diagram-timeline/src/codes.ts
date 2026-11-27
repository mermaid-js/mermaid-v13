/**
 * The warning codes timeline's renderer raises itself, one definition each (D417). The layout's
 * `TIMELINE_CONFIG_IGNORED` is still defined where the layout reads its config (`layout/env.ts`).
 */

/**
 * Warning: author-set `cScale<n>`, `cScaleInv<n>` or `cScaleLabel<n>` theme variables that the
 * active theme's timeline paint does not read (the redux family reads none of them, neo and
 * neo-dark only `cScaleLabel`). The drawing ignores them; the message suggests the default
 * theme, which reads all three (D766, #1326).
 */
export const TIMELINE_PALETTE_IGNORED = 'TIMELINE_PALETTE_IGNORED';
