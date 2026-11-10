import type { RenderContext } from '@mermaid-js/core';

/**
 * What the C4 renderer reads from the render context: the config (`c4.useMaxWidth` and the
 * element palette), the theme, the id prefix and version for the root, and `warn` for
 * `C4_COLOR_INVALID`.
 */
export type C4RenderContext = Pick<
  RenderContext,
  'config' | 'theme' | 'idPrefix' | 'version' | 'warn'
>;
