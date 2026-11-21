import type { Warning } from '@mermaid-js/core';
import type { Limits } from '@mermaid-js/core/limits';
import type { SecurityLevel } from '@mermaid-js/core/svg';
import type { ClassLayoutContext } from '../layout/index.ts';

/**
 * What the class layout and renderer read (DESIGN §3 `RenderContext`). The pipeline's
 * `RenderContext` satisfies it structurally.
 */
export interface ClassRenderContext extends ClassLayoutContext {
  /** The renderer's warnings (style, URL and link-target checks). */
  warn(warning: Warning): void;
  /** Integrator limits (R-SEC-5); the parse took its caps from the same object. */
  readonly limits?: Limits;
  /** Prefix of the root's only ids, `${idPrefix}-title` and `${idPrefix}-desc` (R-A11Y-1). */
  readonly idPrefix?: string;
  /** Written as `data-mermaid-version`. */
  readonly version?: string;
  /** Resolved once per render by the pipeline (D75); `default` when absent. */
  readonly securityLevel?: SecurityLevel;
  /** Integrator link schemes for `click` / `link` URLs (default http, https, mailto). */
  readonly linkSchemes?: readonly string[];
}
