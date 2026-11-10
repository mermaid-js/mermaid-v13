import type { ResolvedConfig } from '@mermaid-js/core/config';
import type { LayoutGraph, LayoutModel, UnitProfile } from '@mermaid-js/core/layout';
import type { InlineSpans, Measurer } from '@mermaid-js/core/text';
import type { Theme } from '@mermaid-js/core/theme';

/** A warning the layout raises (config lengths it can't honour, style checks). */
export interface AgentflowWarning {
  readonly code: string;
  readonly message: string;
  /** Config key path, for config warnings. */
  readonly path?: string;
  /** AST ids of what the warning is about. */
  readonly astIds?: readonly string[];
}

/**
 * What the agentflow layout reads (DESIGN §3 `RenderContext`). The pipeline's `RenderContext`
 * satisfies it structurally.
 */
export interface AgentflowLayoutContext {
  readonly config: ResolvedConfig;
  readonly measurer: Measurer;
  /** Lengths for layout (D77). Defaults to px. */
  readonly units?: UnitProfile;
  /** One render's theme: it records the variables used, so it is never shared. */
  readonly theme: Theme;
  warn(warning: AgentflowWarning): void;
  /** The layout engine named by `layout` config (D171, D327). Defaults to core's `layered`. */
  layout?(graph: LayoutGraph): LayoutModel;
  /** The render's inline-box providers (D177), handed to every label. */
  readonly inline?: InlineSpans;
}
