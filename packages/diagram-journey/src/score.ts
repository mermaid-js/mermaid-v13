/**
 * The journey score scale and the score a face is drawn at (D226). Outside `layout/` so the
 * language facet (hover's mean score) reads it without pulling in layout code (R-LANG-8).
 */

/** The score scale (D226). */
export const SCORE = { min: 0, max: 5, mid: 3 } as const;

/** The score a face is drawn at (D226): `NaN` at the middle, the rest clamped to the scale. */
export function drawnScore(score: number): number {
  if (Number.isNaN(score)) return SCORE.mid;
  return Math.min(SCORE.max, Math.max(SCORE.min, score));
}
