/**
 * The kanban custom layout (spec #424 T3): `layoutKanban`, its input and result types, the
 * adapter from `KanbanModel` and its invariants. The metrics table it takes its lengths from
 * (pitfall 13) stays inside the package.
 */
export { layoutKanban } from './layout.ts';
export { kanbanLayoutInput } from './adapter.ts';
export { kanbanLayoutViolations } from './invariants.ts';
export type { KanbanLayoutContext } from './context.ts';
export type * from './input.ts';
export type * from './types.ts';
