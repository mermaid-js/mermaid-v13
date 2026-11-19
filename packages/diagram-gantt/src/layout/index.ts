/**
 * The gantt custom layout (spec #293 T3): `layoutGantt`, its input and result types, and the
 * metrics table it takes its lengths from. The invariants are in `invariants.ts`, which only tests
 * import.
 */
export {
  GANTT_BAD_DURATION,
  GANTT_ERROR_CODES,
  GANTT_UNKNOWN_TASK,
  layoutGantt,
} from './layout.ts';
export { GANTT_EXCLUDES_NOT_DRAWN } from './parts.ts';
export { GANTT_CONFIG_IGNORED, type GanttLayoutContext } from './env.ts';
export { GANTT_TICK_INTERVAL_IGNORED } from './ticks.ts';
export { GANTT_METRICS, type GanttDefaults, type GanttMetrics } from './metrics.ts';
export type * from './types.ts';
