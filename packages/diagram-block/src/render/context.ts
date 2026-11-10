import type { RenderContext } from '@mermaid-js/core';

/**
 * What the block renderer reads from the render context: the config (`block.useMaxWidth`), the
 * theme, the id prefix and version for the root, and `warn` for style declarations it drops.
 */
export type BlockRenderContext = Pick<
  RenderContext,
  'config' | 'theme' | 'idPrefix' | 'version' | 'warn'
>;
