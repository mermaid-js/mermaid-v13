import type { ResolvedConfig } from '@mermaid-js/core/config';
import type { LayoutGraph, LayoutModel } from '@mermaid-js/core/layout';
import type { Measurer } from '@mermaid-js/core/text';
import type { Theme } from '@mermaid-js/core/theme';

/** A warning the renderer raises (style, URL and link-target checks, unavailable icons). */
export interface FlowWarning {
  readonly code: string;
  readonly message: string;
}

/**
 * What the flowchart's layout and render stages read (DESIGN §3 `RenderContext`). The
 * pipeline's context (#15) satisfies it structurally; tests build one with `renderForTest`.
 */
export interface FlowRenderContext {
  readonly config: ResolvedConfig;
  readonly measurer: Measurer;
  /** One render's theme: it records the variables used, so it is never shared. */
  readonly theme: Theme;
  warn(warning: FlowWarning): void;
  /** The layout engine named by `layout` config. Defaults to core's `layered`. */
  layout?(graph: LayoutGraph): LayoutModel;
  /** Prefix of the root's only ids, `${idPrefix}-title` and `${idPrefix}-desc` (R-A11Y-1). */
  readonly idPrefix?: string;
  /** Written as `data-mermaid-version`. */
  readonly version?: string;
  /** Integrator link schemes for `click` URLs (default http, https, mailto). */
  readonly linkSchemes?: readonly string[];
}
