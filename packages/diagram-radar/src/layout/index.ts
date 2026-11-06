/**
 * The radar custom layout (spec #422 T3): `layoutRadar` and its result type, its invariants,
 * and v12's curve maths (for the ported v12 specs).
 */
export { layoutRadar, type RadarLayoutContext } from './layout.ts';
export { radarLayoutViolations } from './invariants.ts';
export { closedRoundCurve, relativeRadius } from './curve.ts';
export type * from './types.ts';
