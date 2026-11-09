import type { RenderContext } from '@mermaid-js/core';

/**
 * What the venn renderer reads from the render context: the config (`venn.useMaxWidth`, and the
 * author's `themeVariables`, to know which slot colours they set), the theme, the id prefix and
 * version for the root, and `warn` for style values it drops.
 */
export type VennRenderContext = Pick<
  RenderContext,
  'config' | 'theme' | 'idPrefix' | 'version' | 'warn'
>;
