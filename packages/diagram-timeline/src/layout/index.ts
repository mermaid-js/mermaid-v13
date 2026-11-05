/**
 * The timeline custom layout (spec #291 T3): `layoutTimeline`, its result type and its
 * invariants, and the metrics table it takes its lengths from.
 */
export { layoutTimeline } from './layout.ts';
export type { TimelineLayoutContext } from './env.ts';
export { timelineLayoutViolations } from './invariants.ts';
export { TIMELINE_METRICS, type TimelineMetrics } from './metrics.ts';
export type * from './types.ts';
