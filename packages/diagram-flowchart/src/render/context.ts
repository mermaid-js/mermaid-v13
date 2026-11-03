import type { ResolvedConfig } from '@mermaid-js/core/config';
import type { Limits } from '@mermaid-js/core/limits';
import type { LayoutGraph, LayoutModel, UnitProfile } from '@mermaid-js/core/layout';
import type { SecurityLevel } from '@mermaid-js/core/svg';
import type { Measurer } from '@mermaid-js/core/text';
import type { Theme } from '@mermaid-js/core/theme';

/** A warning the renderer raises (style, URL and link-target checks, unavailable icons). */
export interface FlowWarning {
  readonly code: string;
  readonly message: string;
  /** Text output (D82): the feature kind an `ASCII_DROPPED` warning is about. */
  readonly feature?: string;
  /** Text output (D82): the shapes an `ASCII_SHAPE` warning lists. */
  readonly shapes?: readonly string[];
  /** AST ids of what the warning is about. */
  readonly astIds?: readonly string[];
}

/**
 * What the flowchart's layout and render stages read (DESIGN §3 `RenderContext`). The
 * pipeline's `RenderContext` satisfies it structurally.
 */
export interface FlowRenderContext {
  readonly config: ResolvedConfig;
  readonly measurer: Measurer;
  /** Lengths for layout (D77): `pxProfile` for SVG, a cell profile for ASCII. Defaults to px. */
  readonly units?: UnitProfile;
  /** One render's theme: it records the variables used, so it is never shared. */
  readonly theme: Theme;
  warn(warning: FlowWarning): void;
  /** Integrator limits (R-SEC-5); the parse took its caps from the same object. */
  readonly limits?: Limits;
  /** The layout engine named by `layout` config. Defaults to core's `layered`. */
  layout?(graph: LayoutGraph): LayoutModel;
  /** Prefix of the root's only ids, `${idPrefix}-title` and `${idPrefix}-desc` (R-A11Y-1). */
  readonly idPrefix?: string;
  /** Written as `data-mermaid-version`. */
  readonly version?: string;
  /** Resolved once per render by the pipeline (D75); `default` when absent. */
  readonly securityLevel?: SecurityLevel;
  /** Integrator link schemes for `click` URLs (default http, https, mailto). */
  readonly linkSchemes?: readonly string[];
}
