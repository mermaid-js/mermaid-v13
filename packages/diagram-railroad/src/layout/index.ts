/**
 * The railroad custom layout (spec #526 T3): `layoutRailroad`, its result type and the metrics
 * table it takes its fixed lengths from.
 */
export {
  layoutRailroad,
  type ChoiceGuard,
  type RailroadCellOptions,
  type RailroadLayoutContext,
} from './layout.ts';
export { RAILROAD_METRICS } from './metrics.ts';
export type { RailroadMetrics } from './metrics.ts';
export type * from './types.ts';
