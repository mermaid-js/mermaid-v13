/**
 * The kanban custom layout (spec #424 T3): `layoutKanban`, its input and result types, its
 * invariants, and the metrics table it takes its lengths from (pitfall 13).
 */
export { layoutKanban } from './layout.ts';
export { kanbanLayoutViolations } from './invariants.ts';
export type { KanbanLayoutContext } from './context.ts';
export { KANBAN_CONFIG_IGNORED, KANBAN_METRICS, MIN_SECTION_WIDTH } from './metrics.ts';
export type { KanbanMetrics } from './metrics.ts';
export type * from './input.ts';
export type * from './types.ts';
