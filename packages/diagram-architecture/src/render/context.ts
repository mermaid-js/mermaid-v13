import type { RenderContext } from '@mermaid-js/core';

/**
 * What the architecture renderer reads from the render context: the config
 * (`architecture.useMaxWidth`), the theme, the measurer and the inline providers (edge labels
 * are wrapped again where v12 wrapped them, text icons are fitted to their square), the id
 * prefix and version for the root, `warn` for `ICON_NOT_RENDERED` (the inline providers'
 * once-per-render `warn` when there are any), the extensions' `icon` glyphs (D293) for pack
 * icons, and the API's icon packs (whether a pack is still loading, D299).
 */
export type ArchitectureRenderContext = Pick<
  RenderContext,
  'config' | 'theme' | 'measurer' | 'idPrefix' | 'version' | 'warn'
> &
  Partial<Pick<RenderContext, 'inline' | 'icon' | 'iconPacks'>>;
