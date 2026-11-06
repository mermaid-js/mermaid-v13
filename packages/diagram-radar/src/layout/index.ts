/**
 * The radar custom layout (spec #422 T3): `layoutRadar`, its result type, its invariants, the
 * metrics table it takes its fixed lengths from, and v12's curve maths for the renderer.
 */
export {
  layoutRadar,
  RADAR_CURVE_SKIPPED,
  RADAR_EMPTY_RANGE,
  type RadarLayoutContext,
} from './layout.ts';
export { radarLayoutViolations } from './invariants.ts';
export { closedRoundCurve, relativeRadius } from './curve.ts';
export { MAX_TICKS, RADAR_METRICS, RADAR_SLOTS } from './metrics.ts';
export type { RadarMetrics } from './metrics.ts';
export type * from './types.ts';
