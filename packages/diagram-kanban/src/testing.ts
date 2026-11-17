/**
 * Test-only entry (`@mermaid-js/diagram-kanban/testing`): the renderer's harness, for the
 * package's specs and the corpus render properties in conformance, and the model's board order,
 * for conformance's model parity, and the layout invariants.
 */
export { kanbanLayoutViolations } from './layout/invariants.ts';
export { renderKanbanForTest, TEST_VERSION } from './render/harness.ts';
export type { RenderedKanban, RenderKanbanOptions } from './render/harness.ts';
export { kanbanBoardOrder } from './model.ts';
