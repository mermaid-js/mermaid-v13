/**
 * The railroad custom layout (spec #526 T3): `layoutRailroad`, its result type and its
 * invariants, and the metrics table it takes its fixed lengths from.
 */
export { layoutRailroad, type RailroadLayoutContext } from './layout.ts';
export { railroadLayoutViolations } from './invariants.ts';
export { RAILROAD_METRICS } from './metrics.ts';
export type { RailroadMetrics } from './metrics.ts';
export type * from './types.ts';
