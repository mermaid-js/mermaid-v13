import type { Limits } from '@mermaid-js/core/limits';
import type { SecurityLevel } from '@mermaid-js/core/svg';
import type { AgentflowLayoutContext, AgentflowWarning } from '../layout/index.ts';

/** A warning the renderer raises (config lengths, style, URL and link-target checks). */
export type AgentflowRenderWarning = AgentflowWarning;

/**
 * What the agentflow layout and render stages read (DESIGN §3 `RenderContext`). The pipeline's
 * `RenderContext` satisfies it structurally.
 */
export interface AgentflowRenderContext extends AgentflowLayoutContext {
  /** Integrator limits (R-SEC-5); the parse took its caps from the same object. */
  readonly limits?: Limits;
  /** Prefix of the root's only ids, `${idPrefix}-title` and `${idPrefix}-desc` (R-A11Y-1). */
  readonly idPrefix?: string;
  /** Written as `data-mermaid-version`. */
  readonly version?: string;
  /** Resolved once per render by the pipeline (D75); `default` when absent. */
  readonly securityLevel?: SecurityLevel;
  /** Integrator link schemes for `click` URLs (default http, https, mailto). */
  readonly linkSchemes?: readonly string[];
}
