/**
 * The sequence custom layout (spec #125 T3): `layoutSequence`, its result type and its
 * invariants, and the metrics table it takes its lengths from (D108).
 */
export { layoutSequence } from './layout.ts';
export { REVERSE_ARROWS, type SequenceLayoutContext } from './env.ts';
export { sequenceLayoutViolations } from './invariants.ts';
export { metricsTable, sequenceMetrics } from './metrics.ts';
export type { ConfigLengths, FixedLengths, MetricsTable, SequenceMetrics, XY } from './metrics.ts';
export type * from './types.ts';
