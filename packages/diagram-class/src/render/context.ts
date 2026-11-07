import type { Limits } from '@mermaid-js/core/limits';
import type { SecurityLevel } from '@mermaid-js/core/svg';
import type { ClassLayoutContext } from '../layout/index.ts';

/** A warning the renderer raises (style, URL and link-target checks). */
export interface ClassWarning {
  readonly code: string;
  readonly message: string;
  /** Config key path, for config warnings. */
  readonly path?: string;
  /** AST ids of what the warning is about. */
  readonly astIds?: readonly string[];
}

/**
 * What the class layout and renderer read (DESIGN §3 `RenderContext`). The pipeline's
 * `RenderContext` satisfies it structurally.
 */
export interface ClassRenderContext extends ClassLayoutContext {
  warn(warning: ClassWarning): void;
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
