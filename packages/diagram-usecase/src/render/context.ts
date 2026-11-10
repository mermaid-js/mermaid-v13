import type { RenderContext } from '@mermaid-js/core';
import type { UsecaseLayoutContext } from '../layout/context.ts';

/**
 * What the usecase renderer reads from the render context (DESIGN §3): the layout's context
 * (config, measurer, theme, `warn`, inline providers), when it has to measure again; the id
 * prefix and version for the root; the extensions' `icon` glyphs (D293) when one has them.
 * The pipeline's `RenderContext` satisfies it structurally.
 */
export type UsecaseRenderContext = UsecaseLayoutContext &
  Pick<RenderContext, 'idPrefix' | 'version'> &
  Partial<Pick<RenderContext, 'icon'>>;
