import type { Warning } from '@mermaid-js/core';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import type { LayoutGraph, LayoutModel, UnitProfile } from '@mermaid-js/core/layout';
import type { Limits } from '@mermaid-js/core/limits';
import type { InlineSpans, Measurer } from '@mermaid-js/core/text';
import type { Theme } from '@mermaid-js/core/theme';

/**
 * What the ER layout and render stages read (DESIGN §3 `RenderContext`). The pipeline's `RenderContext`
 * satisfies it structurally.
 */
export interface ErRenderContext {
  readonly config: ResolvedConfig;
  readonly measurer: Measurer;
  /** Lengths for layout (ADR-13): `pxProfile` for SVG, a cell profile for ASCII. Defaults to px. */
  readonly units?: UnitProfile;
  /** One render's theme: its font is the one every label is measured in. */
  readonly theme: Theme;
  /** The layout's warnings (style checks). */
  warn(warning: Warning): void;
  /** The layout engine named by `layout` config. Defaults to core's `layered`. */
  layout?(graph: LayoutGraph): LayoutModel;
  /** Integrator limits (R-SEC-5); the parse took its caps from the same object. */
  readonly limits?: Limits;
  /** Prefix of the root's only ids, `${idPrefix}-title` and `${idPrefix}-desc` (R-A11Y-1). */
  readonly idPrefix?: string;
  /** Written as `data-mermaid-version`. */
  readonly version?: string;
  /** The render's inline-box providers (D177), handed to every label; text output boxes none. */
  readonly inline?: InlineSpans;
}
