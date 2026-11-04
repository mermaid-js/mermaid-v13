import type { ResolvedConfig } from '@mermaid-js/core/config';
import type { LayoutGraph, LayoutModel, UnitProfile } from '@mermaid-js/core/layout';
import type { Measurer } from '@mermaid-js/core/text';
import type { Theme } from '@mermaid-js/core/theme';

/**
 * What the class layout reads (DESIGN §3 `RenderContext`); the pipeline's `RenderContext`
 * satisfies it structurally, and the renderer's context (#156) can extend it.
 */
export interface ClassLayoutContext {
  readonly config: ResolvedConfig;
  readonly measurer: Measurer;
  /** Lengths for layout (D77, ADR-13). Defaults to px. */
  readonly units?: UnitProfile;
  /** Gives the font (`fontFamily`, `fontSize`) every label is measured in. */
  readonly theme: Theme;
  /** The layout engine named by `layout` config. Defaults to core's `layered` (D106). */
  layout?(graph: LayoutGraph): LayoutModel;
}
