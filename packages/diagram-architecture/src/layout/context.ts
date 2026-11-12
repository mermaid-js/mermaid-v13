import type { RenderContext } from '@mermaid-js/core';

/**
 * What the architecture layout reads from the render context. `layout` is the engine the
 * `layout` config names (`compass` by default, D284, D326): the layout calls it and nothing
 * else, so no engine is bundled with architecture.
 */
export type ArchitectureLayoutContext = Pick<
  RenderContext,
  'config' | 'measurer' | 'theme' | 'layout' | 'warn'
> &
  Partial<Pick<RenderContext, 'inline'>>;
