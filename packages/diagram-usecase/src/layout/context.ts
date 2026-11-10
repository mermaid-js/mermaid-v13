import type { Warning } from '@mermaid-js/core';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import type { LayoutGraph, LayoutModel, UnitProfile } from '@mermaid-js/core/layout';
import type { InlineSpans, Measurer } from '@mermaid-js/core/text';
import type { Theme } from '@mermaid-js/core/theme';

/**
 * What the usecase layout reads (DESIGN §3 `RenderContext`); the pipeline's `RenderContext`
 * satisfies it structurally, so unit tests run without the pipeline.
 */
export interface UsecaseLayoutContext {
  readonly config: ResolvedConfig;
  readonly measurer: Measurer;
  /**
   * The unit profile; px when left out. The cell profile (text output, `grid` set) sizes every
   * shape in character cells from the cell table and lays the graph out on the grid (T7).
   */
  readonly units?: UnitProfile;
  /** Gives the font (`fontFamily`, `fontSize`) of notes, tables, titles and edge labels. */
  readonly theme: Theme;
  /** Config warnings (`USECASE_CONFIG_IGNORED`) and style warnings. */
  warn(warning: Warning): void;
  /** The layout engine named by `layout` config. Defaults to core's `layered` (R-LAYOUT-7). */
  layout?(graph: LayoutGraph): LayoutModel;
  /** The render's inline-box providers (D177), handed to every label. */
  readonly inline?: InlineSpans;
}
