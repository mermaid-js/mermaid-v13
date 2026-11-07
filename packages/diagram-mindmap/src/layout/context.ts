import type { RenderContext } from '@mermaid-js/core';

/**
 * What the mindmap layout reads from the render context. `layout` is the engine `layout`
 * config names (`tree` by default, D284): the layout calls it and nothing else, so no engine is
 * bundled with mindmap.
 */
export type MindmapLayoutContext = Pick<
  RenderContext,
  'config' | 'measurer' | 'units' | 'theme' | 'layout' | 'warn'
> &
  Partial<Pick<RenderContext, 'inline'>>;
