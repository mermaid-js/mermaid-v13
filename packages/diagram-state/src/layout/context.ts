import type { EmbeddedDiagram } from '@mermaid-js/core';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import type { LayoutGraph, LayoutModel, UnitProfile } from '@mermaid-js/core/layout';
import type { SecurityLevel } from '@mermaid-js/core/svg';
import type { InlineSpans, Measurer } from '@mermaid-js/core/text';
import type { Theme } from '@mermaid-js/core/theme';

/** A warning the layout or renderer raises (style, URL and link-target checks). */
export interface StateWarning {
  readonly code: string;
  readonly message: string;
  /** Config key path, for config warnings. */
  readonly path?: string;
  /** AST ids of what the warning is about. */
  readonly astIds?: readonly string[];
}

/**
 * What the state layout and renderer read (DESIGN §3 `RenderContext`). The pipeline's `RenderContext`
 * satisfies it structurally.
 */
export interface StateRenderContext {
  readonly config: ResolvedConfig;
  readonly measurer: Measurer;
  /** Lengths for layout (D77, ADR-13): `pxProfile` for SVG. Defaults to px. */
  readonly units?: UnitProfile;
  /** One render's theme: it records the variables used, so it is never shared. */
  readonly theme: Theme;
  warn(warning: StateWarning): void;
  /** The layout engine named by `layout` config. Defaults to core's `layered` (D106). */
  layout?(graph: LayoutGraph): LayoutModel;
  /** Prefix of the root's only ids, `${idPrefix}-title` and `${idPrefix}-desc` (R-A11Y-1). */
  readonly idPrefix?: string;
  /** Written as `data-mermaid-version`. */
  readonly version?: string;
  /** Resolved once per render by the pipeline (D75); `default` when absent. */
  readonly securityLevel?: SecurityLevel;
  /** Integrator link schemes for `click` URLs (default http, https, mailto). */
  readonly linkSchemes?: readonly string[];
  /** The render's inline-box providers (D177), handed to every label; text output boxes none. */
  readonly inline?: InlineSpans;
  /**
   * The embedded diagram blocks (ADR-15), rendered by `mermaid` before the draw, by block id.
   * Absent when the plugin is called directly: a block is then drawn as a stand-in frame.
   */
  readonly embed?: (id: string) => EmbeddedDiagram | undefined;
  /** A folded block's inner type, by block id (#670); absent when the plugin is called directly. */
  readonly foldedType?: (id: string) => string | undefined;
}
