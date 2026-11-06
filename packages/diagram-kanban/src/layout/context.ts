import type { RenderContext } from '@mermaid-js/core';

/** What the kanban layout reads from the render context. */
export type KanbanLayoutContext = Pick<
  RenderContext,
  'config' | 'measurer' | 'units' | 'theme' | 'warn'
> &
  Partial<Pick<RenderContext, 'inline'>>;
