/**
 * The kanban custom layout (spec #424 T3): `layoutKanban`, its input and result types and the
 * adapter from `KanbanModel`. The invariants are in `invariants.ts`, which only tests import. The
 * metrics table it takes its lengths from (pitfall 13) stays inside the package.
 */
export { layoutKanban } from './layout.ts';
export { kanbanLayoutInput } from './adapter.ts';
export type { KanbanLayoutContext } from './context.ts';
export type * from './input.ts';
export type * from './types.ts';
