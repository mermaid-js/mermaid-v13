import type { RenderContext } from '@mermaid-js/core';

/**
 * What the mindmap renderer reads from the render context: the config (`mindmap.useMaxWidth`),
 * the theme, the id prefix and version for the root, `warn` for `ICON_NOT_RENDERED`, and the
 * inline providers' once-per-render `warn` when there are any.
 */
export type MindmapRenderContext = Pick<
  RenderContext,
  'config' | 'theme' | 'idPrefix' | 'version' | 'warn'
> &
  Partial<Pick<RenderContext, 'inline'>>;
