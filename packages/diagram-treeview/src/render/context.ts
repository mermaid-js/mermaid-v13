import type { RenderContext } from '@mermaid-js/core';

/** What the treeView renderer reads from the render context. */
export type TreeViewRenderContext = Pick<
  RenderContext,
  'config' | 'theme' | 'warn' | 'idPrefix' | 'version' | 'icon' | 'inline'
>;
